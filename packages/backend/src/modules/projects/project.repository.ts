import { eq, and, isNull, desc, asc, count, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { projects } from '../../db/schema/index.js';
import { type ListProjectsQuery } from '@lifeos/shared';
import { NotFoundError } from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
// Data access layer — all raw Drizzle queries for projects live here.
// ---------------------------------------------------------------------------

/**
 * Insert a new project row.
 */
export async function insertProject(
  data: ProjectInsert,
  tx: Database = db,
): Promise<ProjectRow> {
  const [row] = await tx.insert(projects).values(data).returning();
  if (!row) throw new Error('Failed to insert project');
  return row;
}

/**
 * Find a single project by ID, scoped to the owning user.
 * Excludes soft-deleted projects.
 */
export async function findProjectById(
  projectId: string,
  userId: string,
): Promise<ProjectRow | undefined> {
  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    );
  return row;
}

/**
 * Find a project by ID and userId, or throw NotFoundError.
 */
export async function findProjectByIdOrThrow(
  projectId: string,
  userId: string,
): Promise<ProjectRow> {
  const row = await findProjectById(projectId, userId);
  if (!row) throw new NotFoundError('Project', projectId);
  return row;
}

/**
 * List projects for a user with filtering, sorting, and pagination.
 * Excludes soft-deleted projects.
 */
export async function listProjects(
  userId: string,
  query: ListProjectsQuery,
): Promise<{ rows: ProjectRow[]; total: number }> {
  const conditions: SQL[] = [eq(projects.userId, userId), isNull(projects.deletedAt)];

  if (query.status) {
    conditions.push(eq(projects.status, query.status));
  }

  const whereClause = and(...conditions)!;

  const sortColumn = projects[query.sortBy] ?? projects.createdAt;
  const orderFn = query.sortOrder === 'asc' ? asc : desc;

  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(projects)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * Update a project row. Called inside a transaction by the service.
 */
export async function updateProject(
  projectId: string,
  userId: string,
  data: Partial<ProjectInsert>,
  tx: Database = db,
): Promise<ProjectRow> {
  const [row] = await tx
    .update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Project', projectId);
  return row;
}

/**
 * Soft-delete a project by setting deletedAt.
 */
export async function softDeleteProject(
  projectId: string,
  userId: string,
  tx: Database = db,
): Promise<ProjectRow> {
  const [row] = await tx
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError('Project', projectId);
  return row;
}
