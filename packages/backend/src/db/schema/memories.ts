import { pgTable, uuid, varchar, text, timestamp, vector, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 50 }).notNull(),
    content: text('content').notNull(),
    sourceType: varchar('source_type', { length: 50 }).notNull().default('user'),
    sourceId: uuid('source_id'),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    supersededBy: uuid('superseded_by').references((): AnyPgColumn => memories.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('memories_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('memories_user_category_idx').on(table.userId, table.category),
  ],
);
