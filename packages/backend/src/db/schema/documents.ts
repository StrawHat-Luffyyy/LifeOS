import { pgTable, uuid, varchar, text, integer, timestamp, vector, index, customType } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 500 }).notNull(),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileType: varchar('file_type', { length: 20 }).notNull(),
    fileSize: integer('file_size').notNull(),
    filePath: text('file_path').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('documents_user_id_idx').on(table.userId),
    index('documents_project_id_idx').on(table.projectId),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull().default(1),
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('document_versions_document_id_idx').on(table.documentId),
  ],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentVersionId: uuid('document_version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('document_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('document_chunks_search_vector_idx').using('gin', table.searchVector),
    index('document_chunks_version_idx').on(table.documentVersionId),
    index('document_chunks_user_idx').on(table.userId),
  ],
);
