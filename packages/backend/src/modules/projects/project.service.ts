import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as projectRepo from './project.repository.js';
import {
  type CreateProjectInput,
  type UpdateProjectInput,
  type ListProjectsQuery,
  type ProjectDto,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

/**
 * Create a project and log an activity event in the same transaction.
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  const result = await db.transaction(async (tx) => {
    const project = await projectRepo.insertProject(
      {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        userId,
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'PROJECT_CREATED' satisfies EventType,
      entityType: 'project' satisfies EntityType,
      entityId: project.id,
      projectId: project.id,
      summary: `Created project: ${project.name}`,
      metadata: { status: project.status },
    });

    return project;
  });

  return toProjectDto(result);
}

/**
 * Get a single project by ID, scoped to the user.
 */
export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectDto> {
  const project = await projectRepo.findProjectByIdOrThrow(projectId, userId);
  return toProjectDto(project);
}

/**
 * List projects with filtering, sorting, and pagination.
 */
export async function listProjects(
  userId: string,
  query: ListProjectsQuery,
): Promise<PaginatedResponse<ProjectDto>> {
  const { rows, total } = await projectRepo.listProjects(userId, query);

  return {
    success: true,
    data: rows.map(toProjectDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Update a project and log an activity event in the same transaction.
 */
export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectDto> {
  const existing = await projectRepo.findProjectByIdOrThrow(projectId, userId);

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.status !== undefined) updateData['status'] = input.status;

    const project = await projectRepo.updateProject(projectId, userId, updateData, tx);

    let eventType: EventType = 'PROJECT_UPDATED';
    if (input.status !== undefined && input.status !== existing.status) {
      eventType = 'PROJECT_STATUS_CHANGED';
    }

    await tx.insert(activityEvents).values({
      userId,
      eventType,
      entityType: 'project' satisfies EntityType,
      entityId: project.id,
      projectId: project.id,
      summary:
        eventType === 'PROJECT_STATUS_CHANGED'
          ? `Changed project status: ${project.name} to ${project.status}`
          : `Updated project: ${project.name}`,
      metadata: { changes: Object.keys(updateData) },
    });

    return project;
  });

  return toProjectDto(result);
}

/**
 * Soft-delete a project and log an activity event.
 */
export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<ProjectDto> {
  const result = await db.transaction(async (tx) => {
    const project = await projectRepo.softDeleteProject(projectId, userId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'PROJECT_DELETED' satisfies EventType,
      entityType: 'project' satisfies EntityType,
      entityId: project.id,
      projectId: project.id,
      summary: `Deleted project: ${project.name}`,
    });

    return project;
  });

  return toProjectDto(result);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toProjectDto(row: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ProjectDto['status'],
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
