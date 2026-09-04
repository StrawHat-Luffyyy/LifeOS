import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as taskRepo from './task.repository.js';
import { getProject } from '../projects/project.service.js';
import {
  type CreateTaskInput,
  type UpdateTaskInput,
  type ListTasksQuery,
  type TaskDto,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------
// Business logic lives here. The service orchestrates repositories and
// handles cross-cutting concerns like transactional activity-event logging.
// ---------------------------------------------------------------------------

/**
 * Create a task and log an activity event in the same transaction (FR-TASK-4).
 */
export async function createTask(userId: string, input: CreateTaskInput): Promise<TaskDto> {
  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const result = await db.transaction(async (tx) => {
    const task = await taskRepo.insertTask(
      {
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority,
        status: input.status,
        projectId: input.projectId ?? null,
        userId,
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'TASK_CREATED' satisfies EventType,
      entityType: 'task' satisfies EntityType,
      entityId: task.id,
      projectId: task.projectId,
      summary: `Created task: ${task.title}`,
      metadata: { priority: task.priority, status: task.status },
    });

    return task;
  });

  return toTaskDto(result);
}

/**
 * Get a single task by ID, scoped to the authenticated user.
 */
export async function getTask(userId: string, taskId: string): Promise<TaskDto> {
  const task = await taskRepo.findTaskByIdOrThrow(taskId, userId);
  return toTaskDto(task);
}

/**
 * List tasks with filtering, sorting, and pagination.
 */
export async function listTasks(
  userId: string,
  query: ListTasksQuery,
): Promise<PaginatedResponse<TaskDto>> {
  const { rows, total } = await taskRepo.listTasks(userId, query);

  return {
    success: true,
    data: rows.map(toTaskDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Update a task and log an activity event in the same transaction (FR-TASK-4).
 */
export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskDto> {
  // Fetch the current task to detect meaningful changes
  const existing = await taskRepo.findTaskByIdOrThrow(taskId, userId);

  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData['title'] = input.title;
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.dueDate !== undefined) updateData['dueDate'] = input.dueDate ? new Date(input.dueDate) : null;
    if (input.priority !== undefined) updateData['priority'] = input.priority;
    if (input.status !== undefined) updateData['status'] = input.status;
    if (input.projectId !== undefined) updateData['projectId'] = input.projectId;

    const task = await taskRepo.updateTask(taskId, userId, updateData, tx);

    // Determine event type based on what changed
    let eventType: EventType = 'TASK_UPDATED';
    if (input.status === 'done' && existing.status !== 'done') {
      eventType = 'TASK_COMPLETED';
    }

    await tx.insert(activityEvents).values({
      userId,
      eventType,
      entityType: 'task' satisfies EntityType,
      entityId: task.id,
      projectId: task.projectId,
      summary: eventType === 'TASK_COMPLETED'
        ? `Completed task: ${task.title}`
        : `Updated task: ${task.title}`,
      metadata: { changes: Object.keys(updateData) },
    });

    return task;
  });

  return toTaskDto(result);
}

/**
 * Soft-delete a task and log an activity event (FR-TASK-3, FR-TASK-4).
 */
export async function deleteTask(userId: string, taskId: string): Promise<TaskDto> {
  const result = await db.transaction(async (tx) => {
    const task = await taskRepo.softDeleteTask(taskId, userId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'TASK_DELETED' satisfies EventType,
      entityType: 'task' satisfies EntityType,
      entityId: task.id,
      projectId: task.projectId,
      summary: `Deleted task: ${task.title}`,
    });

    return task;
  });

  return toTaskDto(result);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toTaskDto(row: {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: string;
  status: string;
  projectId: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}): TaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate?.toISOString() ?? null,
    priority: row.priority as TaskDto['priority'],
    status: row.status as TaskDto['status'],
    projectId: row.projectId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
