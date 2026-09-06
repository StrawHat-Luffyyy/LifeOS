import { eq, and, isNull, desc, asc, count, sql, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { documents, documentVersions, documentChunks } from '../../db/schema/index.js';
import { type ListDocumentsQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
export type DocumentVersionRow = typeof documentVersions.$inferSelect;
export type DocumentVersionInsert = typeof documentVersions.$inferInsert;
export type DocumentChunkRow = typeof documentChunks.$inferSelect;
export type DocumentChunkInsert = typeof documentChunks.$inferInsert;

/**
 * Insert a new document row.
 */
export async function insertDocument(
  data: DocumentInsert,
  tx: Database = db,
): Promise<DocumentRow> {
  const [row] = await tx.insert(documents).values(data).returning();
  if (!row) throw new Error('Failed to insert document');
  return row;
}

/**
 * Find document by ID scoped to user.
 */
export async function findDocumentById(
  documentId: string,
  userId: string,
): Promise<DocumentRow | undefined> {
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.userId, userId),
        isNull(documents.deletedAt),
      ),
    );
  return row;
}

/**
 * Find document by ID or throw NotFoundError (404 isolation).
 */
export async function findDocumentByIdOrThrow(
  documentId: string,
  userId: string,
): Promise<DocumentRow> {
  const row = await findDocumentById(documentId, userId);
  if (!row) throw new NotFoundError('Document', documentId);
  return row;
}

/**
 * List documents for a user with optional projectId and status filters.
 */
export async function listDocuments(
  userId: string,
  query: ListDocumentsQuery,
): Promise<{ rows: DocumentRow[]; total: number }> {
  const conditions: SQL[] = [eq(documents.userId, userId), isNull(documents.deletedAt)];

  if (query.projectId) {
    conditions.push(eq(documents.projectId, query.projectId));
  }

  if (query.status) {
    conditions.push(eq(documents.status, query.status));
  }

  const whereClause = and(...conditions)!;
  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(desc(documents.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(documents)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Update a document.
 */
export async function updateDocument(
  documentId: string,
  userId: string,
  data: Partial<DocumentInsert>,
  tx: Database = db,
): Promise<DocumentRow> {
  const [row] = await tx
    .update(documents)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.userId, userId),
        isNull(documents.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Document', documentId);
  return row;
}

/**
 * Update document status by ID directly (used by background worker).
 */
export async function updateDocumentStatus(
  documentId: string,
  status: DocumentRow['status'],
  errorMessage?: string | null,
  tx: Database = db,
): Promise<void> {
  await tx
    .update(documents)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

/**
 * Soft delete a document.
 */
export async function softDeleteDocument(
  documentId: string,
  userId: string,
  tx: Database = db,
): Promise<DocumentRow> {
  const [row] = await tx
    .update(documents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.userId, userId),
        isNull(documents.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Document', documentId);
  return row;
}

/**
 * Insert document version.
 */
export async function insertDocumentVersion(
  data: DocumentVersionInsert,
  tx: Database = db,
): Promise<DocumentVersionRow> {
  const [row] = await tx.insert(documentVersions).values(data).returning();
  if (!row) throw new Error('Failed to insert document version');
  return row;
}

/**
 * Find document versions.
 */
export async function findDocumentVersions(documentId: string): Promise<DocumentVersionRow[]> {
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber));
}

/**
 * Insert batch of document chunks.
 */
export async function insertDocumentChunks(
  chunks: DocumentChunkInsert[],
  tx: Database = db,
): Promise<void> {
  if (chunks.length === 0) return;
  // Drizzle supports batch insert
  await tx.insert(documentChunks).values(chunks);
}

/**
 * List all chunks for a document scoped to user.
 */
export async function findDocumentChunks(
  documentId: string,
  userId: string,
): Promise<DocumentChunkRow[]> {
  return db
    .select()
    .from(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.userId, userId)))
    .orderBy(asc(documentChunks.chunkIndex));
}

/**
 * Delete all chunks for a specific document version.
 */
export async function deleteDocumentChunksByVersion(
  documentVersionId: string,
  tx: Database = db,
): Promise<void> {
  await tx.delete(documentChunks).where(eq(documentChunks.documentVersionId, documentVersionId));
}

/**
 * Vector similarity search across document chunks.
 */
export async function searchDocumentChunksVector(
  userId: string,
  queryEmbedding: number[],
  activeModel: string,
  limit: number = 20,
  projectId?: string,
): Promise<{ row: DocumentChunkRow; distance: number }[]> {
  const conditions: SQL[] = [
    eq(documentChunks.userId, userId),
    eq(documentChunks.embeddingModel, activeModel),
    sql`${documentChunks.embedding} IS NOT NULL`,
  ];

  if (projectId) {
    conditions.push(eq(documentChunks.projectId, projectId));
  }

  const distanceSql = sql<number>`${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`;

  const results = await db
    .select({
      chunk: documentChunks,
      distance: distanceSql,
    })
    .from(documentChunks)
    .where(and(...conditions)!)
    .orderBy(asc(distanceSql))
    .limit(limit);

  return results.map((r) => ({ row: r.chunk, distance: Number(r.distance) }));
}

/**
 * Hybrid search across document chunks using FTS and vector similarity via RRF (k=60).
 */
export async function searchDocumentChunksHybrid(
  userId: string,
  query: string,
  queryEmbedding: number[],
  activeModel: string,
  options: { limit?: number; projectId?: string } = {},
): Promise<{ rows: DocumentChunkRow[]; scores: Map<string, number> }> {
  const limit = options.limit ?? 20;

  // 1. FTS query
  const ftsConditions: SQL[] = [
    eq(documentChunks.userId, userId),
    sql`${documentChunks.searchVector} @@ plainto_tsquery('english', ${query})`,
  ];
  if (options.projectId) {
    ftsConditions.push(eq(documentChunks.projectId, options.projectId));
  }
  const ftsRankSql = sql`ts_rank(${documentChunks.searchVector}, plainto_tsquery('english', ${query}))`;
  const ftsResults = await db
    .select()
    .from(documentChunks)
    .where(and(...ftsConditions)!)
    .orderBy(desc(ftsRankSql))
    .limit(limit * 2);

  // 2. Vector query
  const vectorResults = await searchDocumentChunksVector(
    userId,
    queryEmbedding,
    activeModel,
    limit * 2,
    options.projectId,
  );

  // 3. RRF Fusion (k=60)
  const k = 60;
  const scoreMap = new Map<string, number>();
  const rowMap = new Map<string, DocumentChunkRow>();

  ftsResults.forEach((row, rank) => {
    rowMap.set(row.id, row);
    const score = 1 / (k + rank + 1);
    scoreMap.set(row.id, (scoreMap.get(row.id) ?? 0) + score);
  });

  vectorResults.forEach(({ row }, rank) => {
    rowMap.set(row.id, row);
    const score = 1 / (k + rank + 1);
    scoreMap.set(row.id, (scoreMap.get(row.id) ?? 0) + score);
  });

  const sortedIds = Array.from(scoreMap.keys()).sort(
    (a, b) => (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0),
  );

  const topIds = sortedIds.slice(0, limit);
  const rows = topIds.map((id) => rowMap.get(id)!);

  return { rows, scores: scoreMap };
}
