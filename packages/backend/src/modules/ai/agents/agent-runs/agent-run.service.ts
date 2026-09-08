import {
  type AgentRunDto,
  type AgentRunStatus,
  type AgentType,
  type ListAgentRunsQuery,
  type PaginatedResponse,
  type AgentStepSummaryItem,
} from '@lifeos/shared';
import * as agentRunRepo from './agent-run.repository.js';
import { type AgentRunRow } from './agent-run.repository.js';

export async function createAgentRun(
  userId: string,
  agentType: AgentType,
  projectId?: string | null,
): Promise<AgentRunDto> {
  const row = await agentRunRepo.insertAgentRun({
    userId,
    agentType,
    projectId: projectId ?? null,
    status: 'completed', // will be finalized by caller
    stepsSummary: [],
    metadata: {},
  });
  return toAgentRunDto(row);
}

export async function finalizeAgentRun(
  id: string,
  userId: string,
  data: {
    status: AgentRunStatus;
    stepsSummary: AgentStepSummaryItem[];
    output?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
): Promise<AgentRunDto> {
  const row = await agentRunRepo.updateAgentRun(id, userId, {
    status: data.status,
    stepsSummary: data.stepsSummary,
    output: data.output ?? null,
    metadata: data.metadata ?? {},
    completedAt: new Date(),
  });
  return toAgentRunDto(row);
}

export async function getAgentRun(
  userId: string,
  id: string,
): Promise<AgentRunDto> {
  const row = await agentRunRepo.findAgentRunByIdOrThrow(id, userId);
  return toAgentRunDto(row);
}

export async function listAgentRuns(
  userId: string,
  query: ListAgentRunsQuery,
): Promise<PaginatedResponse<AgentRunDto>> {
  const { rows, total } = await agentRunRepo.listAgentRuns(userId, query);
  return {
    success: true,
    data: rows.map(toAgentRunDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export function toAgentRunDto(row: AgentRunRow): AgentRunDto {
  return {
    id: row.id,
    userId: row.userId,
    agentType: row.agentType as AgentType,
    projectId: row.projectId,
    status: row.status as AgentRunStatus,
    stepsSummary: (Array.isArray(row.stepsSummary)
      ? row.stepsSummary
      : []) as AgentStepSummaryItem[],
    output: (row.output as Record<string, unknown> | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
