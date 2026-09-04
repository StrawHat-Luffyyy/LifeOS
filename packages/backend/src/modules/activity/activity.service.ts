import * as activityRepo from './activity.repository.js';
import { getProject } from '../projects/project.service.js';
import {
  type ListActivityQuery,
  type ListProjectActivityQuery,
  type ActivityEventDto,
  type PaginatedResponse,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

/**
 * List activity events for the user.
 */
export async function listActivity(
  userId: string,
  query: ListActivityQuery,
): Promise<PaginatedResponse<ActivityEventDto>> {
  const { rows, total } = await activityRepo.listActivityEvents(userId, query);

  return {
    success: true,
    data: rows.map(toActivityEventDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * List activity events for a specific project.
 */
export async function listProjectActivity(
  userId: string,
  projectId: string,
  query: ListProjectActivityQuery,
): Promise<PaginatedResponse<ActivityEventDto>> {
  // Validate that the project exists and belongs to the user
  await getProject(userId, projectId);

  const { rows, total } = await activityRepo.listActivityEventsByProject(
    userId,
    projectId,
    query,
  );

  return {
    success: true,
    data: rows.map(toActivityEventDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toActivityEventDto(row: activityRepo.ActivityEventRow): ActivityEventDto {
  return {
    id: row.id,
    userId: row.userId,
    eventType: row.eventType as ActivityEventDto['eventType'],
    entityType: row.entityType as ActivityEventDto['entityType'],
    entityId: row.entityId,
    projectId: row.projectId,
    summary: row.summary,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}
