import { eq, and, isNull, desc, asc, count, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { tasks } from '../../db/schema/index.js';
import { type ListTasksQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskRow = typeof tasks.$inferSelect;
type TaskInsert = typeof tasks.$inferInsert;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
// Data access layer — all raw Drizzle queries live here.
// The service layer calls these functions; it never uses `db` directly.
// ---------------------------------------------------------------------------

/**
 * Insert a new task row. Called inside a transaction by the service.
 */
export async function insertTask(
  data: TaskInsert,
  tx: Database = db,
): Promise<TaskRow> {
  const [row] = await tx.insert(tasks).values(data).returning();
  if (!row) throw new Error('Failed to insert task');
  return row;
}

/**
 * Find a single task by ID, scoped to the owning user.
 * Excludes soft-deleted tasks.
 */
export async function findTaskById(
  taskId: string,
  userId: string,
): Promise<TaskRow | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    );
  return row;
}

/**
 * Find a task by ID and userId, or throw NotFoundError.
 */
export async function findTaskByIdOrThrow(
  taskId: string,
  userId: string,
): Promise<TaskRow> {
  const row = await findTaskById(taskId, userId);
  if (!row) throw new NotFoundError('Task', taskId);
  return row;
}

/**
 * List tasks for a user with filtering, sorting, and pagination.
 * Always excludes soft-deleted tasks.
 */
export async function listTasks(
  userId: string,
  query: ListTasksQuery,
): Promise<{ rows: TaskRow[]; total: number }> {
  const conditions: SQL[] = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];

  if (query.status) conditions.push(eq(tasks.status, query.status));
  if (query.priority) conditions.push(eq(tasks.priority, query.priority));
  if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));

  const whereClause = and(...conditions)!;

  // Determine sort column and direction
  const sortColumn = tasks[query.sortBy] ?? tasks.createdAt;
  const orderFn = query.sortOrder === 'asc' ? asc : desc;

  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(tasks)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Update a task row. Called inside a transaction by the service.
 */
export async function updateTask(
  taskId: string,
  userId: string,
  data: Partial<TaskInsert>,
  tx: Database = db,
): Promise<TaskRow> {
  const [row] = await tx
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Task', taskId);
  return row;
}

/**
 * Soft-delete a task by setting `deletedAt`. Called inside a transaction.
 */
export async function softDeleteTask(
  taskId: string,
  userId: string,
  tx: Database = db,
): Promise<TaskRow> {
  const [row] = await tx
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Task', taskId);
  return row;
}
