import { eq, and, isNull, desc, asc, count, sql, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { notes } from '../../db/schema/index.js';
import { type ListNotesQuery, type SearchNotesQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoteRow = typeof notes.$inferSelect;
export type NoteInsert = typeof notes.$inferInsert;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Insert a new note row.
 */
export async function insertNote(
  data: NoteInsert,
  tx: Database = db,
): Promise<NoteRow> {
  const [row] = await tx.insert(notes).values(data).returning();
  if (!row) throw new Error('Failed to insert note');
  return row;
}

/**
 * Find a single note by ID, scoped to the owning user.
 * Excludes soft-deleted notes.
 */
export async function findNoteById(
  noteId: string,
  userId: string,
): Promise<NoteRow | undefined> {
  const [row] = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    );
  return row;
}

/**
 * Find a note by ID and userId, or throw NotFoundError.
 */
export async function findNoteByIdOrThrow(
  noteId: string,
  userId: string,
): Promise<NoteRow> {
  const row = await findNoteById(noteId, userId);
  if (!row) throw new NotFoundError('Note', noteId);
  return row;
}

/**
 * List notes for a user with optional project or tag filtering, sorting, and pagination.
 * Excludes soft-deleted notes.
 */
export async function listNotes(
  userId: string,
  query: ListNotesQuery,
): Promise<{ rows: NoteRow[]; total: number }> {
  const conditions: SQL[] = [eq(notes.userId, userId), isNull(notes.deletedAt)];

  if (query.projectId) {
    conditions.push(eq(notes.projectId, query.projectId));
  }

  if (query.tag) {
    conditions.push(sql`${notes.tags} @> ARRAY[${query.tag}]::text[]`);
  }

  const whereClause = and(...conditions)!;

  const sortColumn = notes[query.sortBy] ?? notes.createdAt;
  const orderFn = query.sortOrder === 'asc' ? asc : desc;

  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(notes)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notes)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Full-text keyword search across notes using Postgres tsvector and ts_rank.
 */
export async function searchNotes(
  userId: string,
  query: SearchNotesQuery,
): Promise<{ rows: NoteRow[]; total: number }> {
  const conditions: SQL[] = [
    eq(notes.userId, userId),
    isNull(notes.deletedAt),
    sql`${notes.searchVector} @@ plainto_tsquery('english', ${query.q})`,
  ];

  if (query.projectId) {
    conditions.push(eq(notes.projectId, query.projectId));
  }

  const whereClause = and(...conditions)!;
  const rankSql = sql`ts_rank(${notes.searchVector}, plainto_tsquery('english', ${query.q}))`;

  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(notes)
      .where(whereClause)
      .orderBy(desc(rankSql), desc(notes.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notes)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Vector similarity search across notes using cosine distance (<=>).
 * Returns rows ordered by closest cosine distance.
 */
export async function searchNotesVector(
  userId: string,
  queryEmbedding: number[],
  activeModel: string,
  limit: number = 20,
  projectId?: string,
): Promise<{ row: NoteRow; distance: number }[]> {
  const conditions: SQL[] = [
    eq(notes.userId, userId),
    isNull(notes.deletedAt),
    eq(notes.embeddingModel, activeModel),
    sql`${notes.embedding} IS NOT NULL`,
  ];

  if (projectId) {
    conditions.push(eq(notes.projectId, projectId));
  }

  const distanceSql = sql<number>`${notes.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`;

  const results = await db
    .select({
      note: notes,
      distance: distanceSql,
    })
    .from(notes)
    .where(and(...conditions)!)
    .orderBy(asc(distanceSql))
    .limit(limit);

  return results.map((r) => ({ row: r.note, distance: Number(r.distance) }));
}

/**
 * Hybrid search combining FTS keyword search and vector cosine similarity via Reciprocal Rank Fusion (k=60).
 */
export async function searchNotesHybrid(
  userId: string,
  query: string,
  queryEmbedding: number[],
  activeModel: string,
  options: { page?: number; limit?: number; projectId?: string } = {},
): Promise<{ rows: NoteRow[]; total: number; scores: Map<string, number> }> {
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;

  // 1. Fetch top FTS candidates
  const ftsConditions: SQL[] = [
    eq(notes.userId, userId),
    isNull(notes.deletedAt),
    sql`${notes.searchVector} @@ plainto_tsquery('english', ${query})`,
  ];
  if (options.projectId) {
    ftsConditions.push(eq(notes.projectId, options.projectId));
  }
  const ftsRankSql = sql`ts_rank(${notes.searchVector}, plainto_tsquery('english', ${query}))`;
  const ftsResults = await db
    .select()
    .from(notes)
    .where(and(...ftsConditions)!)
    .orderBy(desc(ftsRankSql))
    .limit(limit * 2);

  // 2. Fetch top Vector candidates
  const vectorResults = await searchNotesVector(
    userId,
    queryEmbedding,
    activeModel,
    limit * 2,
    options.projectId,
  );

  // 3. Reciprocal Rank Fusion (k = 60)
  const k = 60;
  const scoreMap = new Map<string, number>();
  const rowMap = new Map<string, NoteRow>();

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

  // Sort all unique items by fused RRF score descending
  const sortedIds = Array.from(scoreMap.keys()).sort(
    (a, b) => (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0),
  );

  const total = sortedIds.length;
  const offset = (page - 1) * limit;
  const pagedIds = sortedIds.slice(offset, offset + limit);
  const rows = pagedIds.map((id) => rowMap.get(id)!);

  return { rows, total, scores: scoreMap };
}

/**
 * Update a note row.
 */
export async function updateNote(
  noteId: string,
  userId: string,
  data: Partial<NoteInsert>,
  tx: Database = db,
): Promise<NoteRow> {
  const [row] = await tx
    .update(notes)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Note', noteId);
  return row;
}

/**
 * Soft-delete a note by setting deletedAt.
 */
export async function softDeleteNote(
  noteId: string,
  userId: string,
  tx: Database = db,
): Promise<NoteRow> {
  const [row] = await tx
    .update(notes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Note', noteId);
  return row;
}
