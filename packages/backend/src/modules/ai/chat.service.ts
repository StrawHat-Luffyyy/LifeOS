import {
  type ChatStreamEvent,
  type MessageDto,
  type RiskTier,
} from '@lifeos/shared';
import * as conversationRepo from './conversation.repository.js';
import { toMessageDto, toToolCallDto } from './conversation.service.js';
import { getLLMProvider } from './gateway/index.js';
import {
  type LLMMessage,
  type LLMToolCall,
} from './gateway/llm-gateway.interface.js';
import { TOOL_DEFINITIONS, TOOL_REGISTRY } from './tools/tool.registry.js';

export const MAX_TOOL_CALLS = 5;

const SYSTEM_PROMPT = `You are LifeOS AI, an intelligent, concise personal productivity assistant.
You help the user manage tasks, projects, notes, documents, and memory in LifeOS.
When requested to create tasks, create notes, update task status, check project context, or search knowledge, call the appropriate tool.

Available tools:
- createTask: Create a new task.
- createNote: Create a new note.
- updateTaskStatus: Update task status (todo, in-progress, done, cancelled).
- getProjectContext: Retrieve open tasks, recent notes, and timeline for a project.
- searchMemory: Search across notes, uploaded documents, and personal memories/preferences.
- queryPlanner: Retrieve prioritized task recommendations and planning advice from the Planner Agent. Use this whenever the user asks what they should work on, what to do next, or how to prioritize tasks.

Crucial instructions:
1. When the user asks questions about their notes, projects, documents, or personal preferences/facts, invoke the \`searchMemory\` tool.
2. Honest answers (FR-RAG-5): If \`searchMemory\` returns no relevant information to answer the user's question, explicitly and honestly state: "I don't have that information in your notes or documents." Never hallucinate, invent facts, or make assumptions.
3. When answering using retrieved context, cite the source note, document, or memory.
4. When the user asks "what should I work on today" or asks for planning/prioritization help, invoke the \`queryPlanner\` tool, highlight the #1 recommendation and explain why, and mention any blocked tasks.
5. Never reveal internal reasoning or chain-of-thought tags.
6. Be concise, helpful, and direct.`;

export async function* streamChatMessage(
  userId: string,
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
): AsyncIterable<ChatStreamEvent> {
  // 1. Verify conversation exists and belongs to user
  const conversation = await conversationRepo.findConversationById(conversationId, userId);
  if (!conversation) {
    yield { type: 'error', message: 'Conversation not found' };
    return;
  }

  // 2. Persist user message immediately (FR-CHAT-2)
  await conversationRepo.insertMessage({
    conversationId,
    role: 'user',
    content: userContent,
    status: 'completed',
  });

  // 3. Retrieve prior conversation history
  const priorMessages = await conversationRepo.listMessagesByConversation(conversationId);

  // Format LLM messages array
  const llmMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const m of priorMessages) {
    llmMessages.push({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    });
  }

  // Generate placeholder ID for the upcoming assistant message
  const assistantMsgId = crypto.randomUUID();
  yield { type: 'message_start', messageId: assistantMsgId };

  let assistantContent = '';
  let toolCallCount = 0;
  const executedToolCalls: conversationRepo.ToolCallRow[] = [];
  const provider = getLLMProvider();

  try {
    let continueLoop = true;

    while (continueLoop) {
      if (signal?.aborted) {
        break;
      }

      let turnContent = '';
      const turnToolCalls: LLMToolCall[] = [];

      const stream = provider.chat({
        messages: llmMessages,
        tools: TOOL_DEFINITIONS,
        signal,
      });

      for await (const event of stream) {
        if (signal?.aborted) break;

        if (event.type === 'token') {
          turnContent += event.content;
          assistantContent += event.content;
          yield { type: 'token', content: event.content };
        } else if (event.type === 'tool_call') {
          turnToolCalls.push({
            id: event.id,
            name: event.name,
            arguments: event.arguments,
          });
        } else if (event.type === 'error') {
          yield { type: 'error', message: event.error };
        }
      }

      if (signal?.aborted) break;

      // Check if tool calls were requested
      if (turnToolCalls.length > 0) {
        // Record assistant's turn in LLM messages
        llmMessages.push({
          role: 'assistant',
          content: turnContent,
          toolCalls: turnToolCalls,
        });

        for (const toolCall of turnToolCalls) {
          if (signal?.aborted) break;

          toolCallCount++;

          // Safeguard: Max tool-call count per assistant turn (FR-SAFE-3)
          if (toolCallCount > MAX_TOOL_CALLS) {
            const limitMsg = `\n\nI have reached the maximum limit of ${MAX_TOOL_CALLS} tool actions for this turn. Stopping to avoid an infinite loop.`;
            assistantContent += limitMsg;
            yield { type: 'token', content: limitMsg };
            continueLoop = false;
            break;
          }

          const registered = TOOL_REGISTRY[toolCall.name];
          const riskTier: RiskTier = registered?.riskTier ?? 'WRITE';

          // Emit tool_call_start
          yield {
            type: 'tool_call_start',
            toolName: toolCall.name,
            riskTier,
            input: toolCall.arguments,
          };

          let toolOutput: Record<string, unknown>;

          if (!registered) {
            toolOutput = { error: `Tool ${toolCall.name} is not recognized` };
          } else {
            try {
              toolOutput = await registered.handler(toolCall.arguments, {
                userId,
                conversationId,
              });
            } catch (handlerErr) {
              const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
              toolOutput = { error: errMsg };
            }
          }

          // Emit tool_call_result
          yield {
            type: 'tool_call_result',
            toolName: toolCall.name,
            output: toolOutput,
          };

          // Audit log in tool_calls table (FR-TOOL-3)
          const loggedTool = await conversationRepo.insertToolCall({
            conversationId,
            messageId: null,
            toolName: toolCall.name,
            riskTier,
            input: toolCall.arguments,
            output: toolOutput,
          });
          executedToolCalls.push(loggedTool);

          // Append tool execution result into LLM conversation history
          llmMessages.push({
            role: 'tool',
            content: JSON.stringify(toolOutput),
            toolCallId: toolCall.id,
          });
        }
      } else {
        // No tool calls requested, turn is complete
        continueLoop = false;
      }
    }
  } catch (loopErr) {
    if (!signal?.aborted) {
      const msg = loopErr instanceof Error ? loopErr.message : String(loopErr);
      yield { type: 'error', message: msg };
    }
  }

  // 4. Client disconnect handling or normal completion (FR-CHAT-2)
  const isInterrupted = Boolean(signal?.aborted);
  const status = isInterrupted ? 'interrupted' : 'completed';

  // Persist assistant message (with generated content or partial content if interrupted)
  const assistantRow = await conversationRepo.insertMessage({
    conversationId,
    role: 'assistant',
    content: assistantContent || (isInterrupted ? '(Response interrupted)' : ''),
    status,
  });

  // Link executed tool calls to the newly created assistant message
  if (executedToolCalls.length > 0) {
    await conversationRepo.linkToolCallsToMessage(
      executedToolCalls.map((t) => t.id),
      assistantRow.id,
    );
  }

  // Touch conversation updatedAt
  await conversationRepo.updateConversation(conversationId, userId, {
    updatedAt: new Date(),
  });

  const finalMessageDto: MessageDto = toMessageDto(
    assistantRow,
    executedToolCalls.map(toToolCallDto),
  );

  yield {
    type: 'message_complete',
    message: finalMessageDto,
  };
}
