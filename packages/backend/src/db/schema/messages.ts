import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('completed'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
