import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';
import { messages } from './messages.js';

/**
 * Tool calls audit log table (FR-TOOL-3).
 * Records every tool call invoked by the assistant along with risk tier, input, and output.
 */
export const toolCalls = pgTable('tool_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  messageId: uuid('message_id').references(() => messages.id),
  toolName: varchar('tool_name', { length: 100 }).notNull(),
  riskTier: varchar('risk_tier', { length: 20 }).notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  output: jsonb('output').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
