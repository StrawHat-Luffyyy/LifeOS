import { eq, and, desc, count, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import { type ListActivityQuery, type ListProjectActivityQuery } from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityEventRow = typeof activityEvents.$inferSelect;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * List activity events for a user with optional entityType filter, paginated, most recent first.
 */
export async function listActivityEvents(
  userId: string,
  query: ListActivityQuery,
): Promise<{ rows: ActivityEventRow[]; total: number }> {
  const conditions: SQL[] = [eq(activityEvents.userId, userId)];

  if (query.entityType) {
    conditions.push(eq(activityEvents.entityType, query.entityType));
  }

  const whereClause = and(...conditions)!;
  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(activityEvents)
      .where(whereClause)
      .orderBy(desc(activityEvents.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(activityEvents)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}

/**
 * List activity events scoped to a specific project.
 */
export async function listActivityEventsByProject(
  userId: string,
  projectId: string,
  query: ListProjectActivityQuery,
): Promise<{ rows: ActivityEventRow[]; total: number }> {
  const whereClause = and(
    eq(activityEvents.userId, userId),
    eq(activityEvents.projectId, projectId),
  );

  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(activityEvents)
      .where(whereClause)
      .orderBy(desc(activityEvents.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(activityEvents)
      .where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}
