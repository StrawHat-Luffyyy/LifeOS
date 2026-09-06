import { eq, and, isNull, desc, asc, count, sql, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { memories } from '../../db/schema/index.js';
import { type ListMemoriesQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

export type MemoryRow = typeof memories.$inferSelect;
export type MemoryInsert = typeof memories.$inferInsert;

/**
 * Insert a new memory row.
 */
export async function insertMemory(
  data: MemoryInsert,
  tx: Database = db,
): Promise<MemoryRow> {
  const [row] = await tx.insert(memories).values(data).returning();
  if (!row) throw new Error('Failed to insert memory');
  return row;
}

/**
 * Find a single memory by ID scoped to user (excluding soft-deleted).
 */
export async function findMemoryById(
  memoryId: string,
  userId: string,
): Promise<MemoryRow | undefined> {
  const [row] = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.id, memoryId),
        eq(memories.userId, userId),
        isNull(memories.deletedAt),
      ),
    );
  return row;
}

/**
 * Find a memory or throw NotFoundError (404 isolation).
 */
export async function findMemoryByIdOrThrow(
  memoryId: string,
  userId: string,
): Promise<MemoryRow> {
  const row = await findMemoryById(memoryId, userId);
  if (!row) throw new NotFoundError('Memory', memoryId);
  return row;
}

/**
 * List memories for a user with category filtering, active-only flag, and pagination.
 */
export async function listMemories(
  userId: string,
  query: ListMemoriesQuery,
): Promise<{ rows: MemoryRow[]; total: number }> {
  const conditions: SQL[] = [eq(memories.userId, userId), isNull(memories.deletedAt)];

  if (query.category) {
    conditions.push(eq(memories.category, query.category));
  }

  if (query.activeOnly) {
    // Active means not superseded
    conditions.push(isNull(memories.supersededBy));
  }

  const whereClause = and(...conditions)!;
  const sortColumn = query.sortBy === 'updatedAt' ? memories.updatedAt : memories.createdAt;
  const orderFn = query.sortOrder === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(memories)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(memories)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Find an active memory that has cosine similarity >= similarityThreshold (default 0.90)
 * to detect conflicts/updates (OD-2).
 * Cosine distance <= 1 - similarityThreshold (e.g. <= 0.10).
 */
export async function findSimilarActiveMemory(
  userId: string,
  embedding: number[],
  activeModel: string,
  similarityThreshold = 0.90,
  excludeId?: string,
): Promise<{ row: MemoryRow; similarity: number } | undefined> {
  const maxDistance = 1 - similarityThreshold;
  const distanceSql = sql<number>`${memories.embedding} <=> ${JSON.stringify(embedding)}::vector`;

  const conditions: SQL[] = [
    eq(memories.userId, userId),
    isNull(memories.deletedAt),
    isNull(memories.supersededBy),
    eq(memories.embeddingModel, activeModel),
    sql`${memories.embedding} IS NOT NULL`,
    sql`${distanceSql} <= ${maxDistance}`,
  ];

  if (excludeId) {
    conditions.push(sql`${memories.id} != ${excludeId}`);
  }

  const [match] = await db
    .select({
      memory: memories,
      distance: distanceSql,
    })
    .from(memories)
    .where(and(...conditions)!)
    .orderBy(asc(distanceSql))
    .limit(1);

  if (!match) return undefined;
  return {
    row: match.memory,
    similarity: 1 - Number(match.distance),
  };
}

/**
 * Mark a memory as superseded by another memory (OD-2 provenance preservation).
 */
export async function markSuperseded(
  oldMemoryId: string,
  newMemoryId: string,
  tx: Database = db,
): Promise<void> {
  await tx
    .update(memories)
    .set({
      supersededBy: newMemoryId,
      updatedAt: new Date(),
    })
    .where(eq(memories.id, oldMemoryId));
}

/**
 * Vector similarity search across active memories for RAG retrieval.
 */
export async function searchMemoriesVector(
  userId: string,
  queryEmbedding: number[],
  activeModel: string,
  limit: number = 10,
): Promise<{ row: MemoryRow; similarity: number }[]> {
  const distanceSql = sql<number>`${memories.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`;

  const conditions: SQL[] = [
    eq(memories.userId, userId),
    isNull(memories.deletedAt),
    isNull(memories.supersededBy),
    eq(memories.embeddingModel, activeModel),
    sql`${memories.embedding} IS NOT NULL`,
  ];

  const results = await db
    .select({
      memory: memories,
      distance: distanceSql,
    })
    .from(memories)
    .where(and(...conditions)!)
    .orderBy(asc(distanceSql))
    .limit(limit);

  return results.map((r) => ({
    row: r.memory,
    similarity: 1 - Number(r.distance),
  }));
}

/**
 * Update memory row.
 */
export async function updateMemory(
  memoryId: string,
  userId: string,
  data: Partial<MemoryInsert>,
  tx: Database = db,
): Promise<MemoryRow> {
  const [row] = await tx
    .update(memories)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(memories.id, memoryId),
        eq(memories.userId, userId),
        isNull(memories.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Memory', memoryId);
  return row;
}

/**
 * Soft-delete memory row.
 */
export async function softDeleteMemory(
  memoryId: string,
  userId: string,
  tx: Database = db,
): Promise<MemoryRow> {
  const [row] = await tx
    .update(memories)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(memories.id, memoryId),
        eq(memories.userId, userId),
        isNull(memories.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Memory', memoryId);
  return row;
}
