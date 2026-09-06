/* eslint-disable no-console */
import { db } from '../db/index.js';
import { users, conversations, messages, toolCalls } from '../db/schema/index.js';
import { streamChatMessage } from '../modules/ai/chat.service.js';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('====================================================');
  console.log('LifeOS V3-1 — Proving Retrieval is Conditional, Not Reflexive');
  console.log('Question: "What is a REST API? Explain briefly."');
  console.log('====================================================\n');

  // 1. Get user
  const [user] = await db.select().from(users).limit(1);
  if (!user) throw new Error('No user found');
  console.log(`Using user: ${user.email} (${user.id})`);

  // 2. Create a clean conversation for this test
  const [conv] = await db
    .insert(conversations)
    .values({
      userId: user.id,
      title: 'V3-1 General Knowledge Test',
    })
    .returning();
  if (!conv) throw new Error('Failed to create conversation');
  console.log(`Created conversation: ${conv.id}`);

  // 3. Stream chat message for general knowledge question (no personal context)
  const question = 'What is a REST API? Explain briefly in two sentences.';
  console.log(`\nSending prompt: "${question}"`);

  let textOutput = '';
  const toolsInvoked: string[] = [];

  for await (const event of streamChatMessage(user.id, conv.id, question)) {
    if (event.type === 'token') {
      textOutput += event.content;
      process.stdout.write(event.content);
    } else if (event.type === 'tool_call_start') {
      toolsInvoked.push(event.toolName);
      console.log(`\n[TOOL_CALL DETECTED]: ${event.toolName}`);
    }
  }

  console.log('\n\n--- Turn Complete ---');
  console.log(`Tools invoked during turn: ${JSON.stringify(toolsInvoked)}`);

  // 4. Query database tool_calls table to verify database persistence
  const convMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id));

  const messageIds = convMessages.map((m) => m.id);
  const dbToolCalls = await db.select().from(toolCalls);
  const convToolCalls = dbToolCalls.filter((tc) => tc.messageId && messageIds.includes(tc.messageId));

  console.log(`Persisted tool calls for conversation in DB: ${convToolCalls.length}`);

  // 5. Assertions for V3-1
  if (toolsInvoked.length > 0) {
    throw new Error(`FAIL: Tools were invoked for general knowledge question: ${toolsInvoked.join(', ')}`);
  }
  if (convToolCalls.length > 0) {
    throw new Error(`FAIL: Database contains ${convToolCalls.length} tool calls for general knowledge question`);
  }
  if (!textOutput.toLowerCase().includes('rest') && !textOutput.toLowerCase().includes('api')) {
    throw new Error('FAIL: Output did not contain expected explanation of REST API');
  }

  console.log('\n====================================================');
  console.log('✓ SUCCESS: ZERO tool calls invoked for general knowledge.');
  console.log('✓ PROVEN: Retrieval is genuinely conditional, not reflexive!');
  console.log('====================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error running test-v3-1:', err);
  process.exit(1);
});
