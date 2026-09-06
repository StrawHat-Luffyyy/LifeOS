import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, customType, vector, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    projectId: uuid('project_id').references(() => projects.id),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    searchVector: tsvector('search_vector'),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('notes_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('notes_search_vector_idx').using('gin', table.searchVector),
  ],
);
