import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChatMessage, MAX_TOOL_CALLS } from './chat.service.js';
import * as conversationRepo from './conversation.repository.js';
import { setLLMProviderForTesting } from './gateway/index.js';
import { MockLLMProvider } from './gateway/mock.provider.js';
import { TOOL_REGISTRY } from './tools/tool.registry.js';

vi.mock('./conversation.repository.js');

describe('ChatService Orchestrator (P2-3, P2-4, FR-SAFE-3)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const conversationId = '22222222-2222-2222-2222-222222222222';
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = new MockLLMProvider();
    setLLMProviderForTesting(mockProvider);

    // Mock conversation exists
    vi.mocked(conversationRepo.findConversationById).mockResolvedValue({
      id: conversationId,
      userId,
      projectId: null,
      title: 'Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    vi.mocked(conversationRepo.insertMessage).mockImplementation(async (data) => ({
      id: `msg-${Date.now()}-${Math.random()}`,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      status: data.status ?? 'completed',
      createdAt: new Date(),
    }));

    vi.mocked(conversationRepo.listMessagesByConversation).mockResolvedValue([]);
    vi.mocked(conversationRepo.updateConversation).mockResolvedValue({} as any);
    vi.mocked(conversationRepo.insertToolCall).mockImplementation(async (data) => ({
      id: `tc-${Date.now()}`,
      conversationId: data.conversationId,
      messageId: data.messageId ?? null,
      toolName: data.toolName,
      riskTier: data.riskTier,
      input: data.input,
      output: data.output,
      createdAt: new Date(),
    }));
  });

  it('streams assistant tokens and persists completed message', async () => {
    mockProvider.setResponses([
      {
        events: [
          { type: 'token', content: 'Hello! ' },
          { type: 'token', content: 'How can I help?' },
          { type: 'done', finishReason: 'stop' },
        ],
      },
    ]);

    const events: any[] = [];
    for await (const ev of streamChatMessage(userId, conversationId, 'Hi')) {
      events.push(ev);
    }

    // Must persist user message first
    expect(conversationRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        role: 'user',
        content: 'Hi',
        status: 'completed',
      }),
    );

    // Stream events sequence
    expect(events[0]).toMatchObject({ type: 'message_start' });
    expect(events[1]).toEqual({ type: 'token', content: 'Hello! ' });
    expect(events[2]).toEqual({ type: 'token', content: 'How can I help?' });
    expect(events[3]).toMatchObject({
      type: 'message_complete',
      message: expect.objectContaining({
        role: 'assistant',
        content: 'Hello! How can I help?',
        status: 'completed',
      }),
    });

    // Assistant message persisted with status completed
    expect(conversationRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        role: 'assistant',
        content: 'Hello! How can I help?',
        status: 'completed',
      }),
    );
  });

  it('executes a tool call, emits events, logs to tool_calls, and streams final response', async () => {
    // Tool handler spy
    const createTaskSpy = vi.spyOn(TOOL_REGISTRY['createTask']!, 'handler').mockResolvedValue({
      success: true,
      task: { id: 'task-new', title: 'Buy groceries' },
    });

    // Turn 1: Model emits tool call
    // Turn 2: Model receives tool result and outputs text confirmation
    mockProvider.setResponses([
      {
        events: [
          {
            type: 'tool_call',
            id: 'call_1',
            name: 'createTask',
            arguments: { title: 'Buy groceries', priority: 'medium' },
          },
          { type: 'done', finishReason: 'tool_calls' },
        ],
      },
      {
        events: [
          { type: 'token', content: 'I have created the task "Buy groceries" for you.' },
          { type: 'done', finishReason: 'stop' },
        ],
      },
    ]);

    const events: any[] = [];
    for await (const ev of streamChatMessage(userId, conversationId, 'Create a task to buy groceries')) {
      events.push(ev);
    }

    // Handler called with arguments and context
    expect(createTaskSpy).toHaveBeenCalledWith(
      { title: 'Buy groceries', priority: 'medium' },
      { userId, conversationId },
    );

    // Audit log inserted into tool_calls table (FR-TOOL-3)
    expect(conversationRepo.insertToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        toolName: 'createTask',
        riskTier: 'WRITE',
        input: { title: 'Buy groceries', priority: 'medium' },
        output: { success: true, task: { id: 'task-new', title: 'Buy groceries' } },
      }),
    );

    // Check SSE event flow
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('message_start');
    expect(eventTypes).toContain('tool_call_start');
    expect(eventTypes).toContain('tool_call_result');
    expect(eventTypes).toContain('token');
    expect(eventTypes).toContain('message_complete');

    createTaskSpy.mockRestore();
  });

  it('enforces max 5 tool calls limit per turn (FR-SAFE-3)', async () => {
    // Return tool calls continuously
    const infiniteToolResponses = Array.from({ length: 10 }, (_, i) => ({
      events: [
        {
          type: 'tool_call' as const,
          id: `call_${i}`,
          name: 'createNote',
          arguments: { title: `Note ${i}` },
        },
        { type: 'done' as const, finishReason: 'tool_calls' as const },
      ],
    }));

    mockProvider.setResponses(infiniteToolResponses);

    const createNoteSpy = vi.spyOn(TOOL_REGISTRY['createNote']!, 'handler').mockResolvedValue({
      success: true,
    });

    const events: any[] = [];
    for await (const ev of streamChatMessage(userId, conversationId, 'Loop test')) {
      events.push(ev);
    }

    // Handler called exactly MAX_TOOL_CALLS times
    expect(createNoteSpy).toHaveBeenCalledTimes(MAX_TOOL_CALLS);

    // User receives notification of loop stop
    const tokenEvents = events.filter((e) => e.type === 'token');
    const combinedTokens = tokenEvents.map((e) => e.content).join('');
    expect(combinedTokens).toContain(`I have reached the maximum limit of ${MAX_TOOL_CALLS} tool actions`);

    createNoteSpy.mockRestore();
  });

  it('persists partial assistant message with status: interrupted on client disconnect (FR-CHAT-2)', async () => {
    const abortController = new AbortController();

    mockProvider.setResponses([
      {
        events: [
          { type: 'token', content: 'First partial sentence. ' },
          { type: 'token', content: 'Second partial sentence.' },
        ],
      },
    ]);

    const events: any[] = [];
    for await (const ev of streamChatMessage(
      userId,
      conversationId,
      'Tell me something',
      abortController.signal,
    )) {
      events.push(ev);
      // Abort after first token
      if (ev.type === 'token') {
        abortController.abort();
      }
    }

    // Verify assistant message was saved with status: interrupted and partial text
    expect(conversationRepo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        role: 'assistant',
        content: expect.stringContaining('First partial sentence'),
        status: 'interrupted',
      }),
    );
  });
});
