import { eq, and, isNull, desc, asc, count, inArray, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { tasks, taskDependencies } from '../../db/schema/index.js';
import { type ListTasksQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskRow = typeof tasks.$inferSelect;
type TaskInsert = typeof tasks.$inferInsert;
export type TaskDependencyRow = typeof taskDependencies.$inferSelect;

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

// ---------------------------------------------------------------------------
// Task Dependency Repository Methods (P4-1)
// ---------------------------------------------------------------------------

/**
 * Insert a dependency link (taskId depends on dependsOnTaskId).
 */
export async function insertTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  tx: Database = db,
): Promise<TaskDependencyRow> {
  const [row] = await tx
    .insert(taskDependencies)
    .values({ taskId, dependsOnTaskId })
    .returning();
  if (!row) throw new Error('Failed to insert task dependency');
  return row;
}

/**
 * Delete a dependency link.
 */
export async function deleteTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  tx: Database = db,
): Promise<boolean> {
  const result = await tx
    .delete(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    )
    .returning();
  return result.length > 0;
}

/**
 * Find single dependency relation.
 */
export async function findTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<TaskDependencyRow | undefined> {
  const [row] = await db
    .select()
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    );
  return row;
}

/**
 * List all dependencies for a user (used for in-memory cycle detection & graph traversal).
 * Ensures both tasks belong to the user and are not soft-deleted.
 */
export async function listAllUserDependencies(
  userId: string,
): Promise<Array<{ taskId: string; dependsOnTaskId: string }>> {
  const userTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));

  const taskIds = userTasks.map((t) => t.id);
  if (taskIds.length === 0) return [];

  return await db
    .select({
      taskId: taskDependencies.taskId,
      dependsOnTaskId: taskDependencies.dependsOnTaskId,
    })
    .from(taskDependencies)
    .where(
      and(
        inArray(taskDependencies.taskId, taskIds),
        inArray(taskDependencies.dependsOnTaskId, taskIds),
      ),
    );
}

/**
 * List what this task depends on (prerequisites).
 */
export async function listTaskPrerequisites(
  taskId: string,
): Promise<Array<{ dependency: TaskDependencyRow; task: TaskRow }>> {
  const rows = await db
    .select({
      dependency: taskDependencies,
      task: tasks,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(and(eq(taskDependencies.taskId, taskId), isNull(tasks.deletedAt)));

  return rows;
}

/**
 * List tasks that depend on this task (tasks blocked by this task).
 */
export async function listTaskDependents(
  taskId: string,
): Promise<Array<{ dependency: TaskDependencyRow; task: TaskRow }>> {
  const rows = await db
    .select({
      dependency: taskDependencies,
      task: tasks,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(and(eq(taskDependencies.dependsOnTaskId, taskId), isNull(tasks.deletedAt)));

  return rows;
}
