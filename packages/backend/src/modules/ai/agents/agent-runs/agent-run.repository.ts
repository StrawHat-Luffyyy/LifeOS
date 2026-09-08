import { eq, and, desc, count, type SQL } from 'drizzle-orm';
import { db, type Database } from '../../../../db/index.js';
import { agentRuns } from '../../../../db/schema/index.js';
import { type ListAgentRunsQuery, type AgentRunStatus, type AgentType } from '@lifeos/shared';
import { NotFoundError } from '../../../../lib/errors.js';

export type AgentRunRow = typeof agentRuns.$inferSelect;
export type AgentRunInsert = typeof agentRuns.$inferInsert;

export async function insertAgentRun(
  data: AgentRunInsert,
  tx: Database = db,
): Promise<AgentRunRow> {
  const [row] = await tx.insert(agentRuns).values(data).returning();
  if (!row) throw new Error('Failed to insert agent run');
  return row;
}

export async function updateAgentRun(
  id: string,
  userId: string,
  data: {
    status?: AgentRunStatus;
    stepsSummary?: unknown;
    output?: unknown;
    metadata?: unknown;
    completedAt?: Date;
  },
  tx: Database = db,
): Promise<AgentRunRow> {
  const [row] = await tx
    .update(agentRuns)
    .set({
      ...(data.status ? { status: data.status } : {}),
      ...(data.stepsSummary !== undefined ? { stepsSummary: data.stepsSummary as any } : {}),
      ...(data.output !== undefined ? { output: data.output as any } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as any } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
    })
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
    .returning();

  if (!row) throw new NotFoundError('AgentRun', id);
  return row;
}

export async function findAgentRunById(
  id: string,
  userId: string,
): Promise<AgentRunRow | undefined> {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)));
  return row;
}

export async function findAgentRunByIdOrThrow(
  id: string,
  userId: string,
): Promise<AgentRunRow> {
  const row = await findAgentRunById(id, userId);
  if (!row) throw new NotFoundError('AgentRun', id);
  return row;
}

export async function listAgentRuns(
  userId: string,
  query: ListAgentRunsQuery,
): Promise<{ rows: AgentRunRow[]; total: number }> {
  const conditions: SQL[] = [eq(agentRuns.userId, userId)];

  if (query.agentType) conditions.push(eq(agentRuns.agentType, query.agentType as AgentType));
  if (query.projectId) conditions.push(eq(agentRuns.projectId, query.projectId));
  if (query.status) conditions.push(eq(agentRuns.status, query.status as AgentRunStatus));

  const whereClause = and(...conditions)!;
  const offset = (query.page - 1) * query.limit;

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(agentRuns)
      .where(whereClause)
      .orderBy(desc(agentRuns.startedAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ count: count() }).from(agentRuns).where(whereClause),
  ]);

  return { rows, total: countResult?.count ?? 0 };
}
