import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as taskRepo from './task.repository.js';
import { getProject } from '../projects/project.service.js';
import {
  type CreateTaskInput,
  type UpdateTaskInput,
  type ListTasksQuery,
  type TaskDto,
  type TaskDependencyDto,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';
import { ValidationError, ConflictError, NotFoundError } from '../../lib/errors.js';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------
// Business logic lives here. The service orchestrates repositories and
// handles cross-cutting concerns like transactional activity-event logging.
// ---------------------------------------------------------------------------

/**
 * Create a task and log an activity event in the same transaction (FR-TASK-4).
 */
export async function createTask(
  userId: string,
  input: CreateTaskInput,
  context?: { source?: string; conversationId?: string },
): Promise<TaskDto> {
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
      metadata: {
        priority: task.priority,
        status: task.status,
        ...(context?.source ? { source: context.source } : {}),
        ...(context?.conversationId ? { conversationId: context.conversationId } : {}),
      },
    });

    return task;
  });

  return toTaskDto(result);
}

/**
 * Get a single task by ID, scoped to the authenticated user with dependency status.
 */
export async function getTask(userId: string, taskId: string): Promise<TaskDto> {
  const task = await taskRepo.findTaskByIdOrThrow(taskId, userId);
  const prereqs = await taskRepo.listTaskPrerequisites(taskId);

  const incompletePrereqs = prereqs.filter((p) => p.task.status !== 'done');
  const isBlocked = incompletePrereqs.length > 0;
  const blockedBy = incompletePrereqs.map((p) => p.task.title);

  const dto = toTaskDto(task);
  dto.dependencies = prereqs.map((p) => ({
    id: p.dependency.id,
    taskId: p.dependency.taskId,
    dependsOnTaskId: p.dependency.dependsOnTaskId,
    createdAt: p.dependency.createdAt.toISOString(),
    dependsOnTaskTitle: p.task.title,
    dependsOnTaskStatus: p.task.status as any,
  }));
  dto.isBlocked = isBlocked;
  dto.blockedBy = blockedBy;

  return dto;
}

/**
 * List tasks with filtering, sorting, and pagination, enriched with dependency status.
 */
export async function listTasks(
  userId: string,
  query: ListTasksQuery,
): Promise<PaginatedResponse<TaskDto>> {
  const { rows, total } = await taskRepo.listTasks(userId, query);

  const dtos = rows.map(toTaskDto);
  if (dtos.length > 0) {
    const allUserDeps = await taskRepo.listAllUserDependencies(userId);
    const taskMap = new Map(rows.map((r) => [r.id, r]));

    for (const dto of dtos) {
      const myPrereqs = allUserDeps.filter((d) => d.taskId === dto.id);
      const incompletePrereqTitles: string[] = [];

      for (const p of myPrereqs) {
        const depTask = taskMap.get(p.dependsOnTaskId);
        if (depTask && depTask.status !== 'done') {
          incompletePrereqTitles.push(depTask.title);
        }
      }

      dto.isBlocked = incompletePrereqTitles.length > 0;
      dto.blockedBy = incompletePrereqTitles;
    }
  }

  return {
    success: true,
    data: dtos,
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
  context?: { source?: string; conversationId?: string },
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
      metadata: {
        changes: Object.keys(updateData),
        ...(context?.source ? { source: context.source } : {}),
        ...(context?.conversationId ? { conversationId: context.conversationId } : {}),
      },
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
// Task Dependency Service Methods (P4-1)
// ---------------------------------------------------------------------------

/**
 * Add a dependency: taskId depends on dependsOnTaskId (P4-1).
 * Rejects self-dependency and circular dependencies of any length.
 */
export async function addDependency(
  userId: string,
  taskId: string,
  dependsOnTaskId: string,
): Promise<TaskDependencyDto> {
  if (taskId === dependsOnTaskId) {
    throw new ValidationError('Cannot add self-dependency');
  }

  // Ensure both tasks exist and belong to the user (throws NotFoundError otherwise)
  const [task, dependsOnTask] = await Promise.all([
    taskRepo.findTaskByIdOrThrow(taskId, userId),
    taskRepo.findTaskByIdOrThrow(dependsOnTaskId, userId),
  ]);

  // Check if link already exists
  const existing = await taskRepo.findTaskDependency(taskId, dependsOnTaskId);
  if (existing) {
    throw new ConflictError('Task dependency already exists');
  }

  // Cycle detection:
  // Adding edge taskId -> dependsOnTaskId creates a cycle if and only if
  // there is already a directed path from dependsOnTaskId to taskId.
  const allDeps = await taskRepo.listAllUserDependencies(userId);
  const graph = new Map<string, string[]>();
  for (const dep of allDeps) {
    const list = graph.get(dep.taskId) ?? [];
    list.push(dep.dependsOnTaskId);
    graph.set(dep.taskId, list);
  }

  // BFS starting at dependsOnTaskId looking for taskId
  const queue: string[] = [dependsOnTaskId];
  const visited = new Set<string>([dependsOnTaskId]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === taskId) {
      throw new ValidationError(
        'Circular dependency detected: adding this dependency creates a cycle',
      );
    }
    const neighbors = graph.get(curr) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Insert dependency link
  const dep = await taskRepo.insertTaskDependency(taskId, dependsOnTaskId);

  // Log activity event
  await db.insert(activityEvents).values({
    userId,
    eventType: 'TASK_UPDATED' satisfies EventType,
    entityType: 'task' satisfies EntityType,
    entityId: taskId,
    projectId: task.projectId,
    summary: `Added dependency: "${task.title}" depends on "${dependsOnTask.title}"`,
    metadata: {
      action: 'ADD_DEPENDENCY',
      dependsOnTaskId,
      dependsOnTaskTitle: dependsOnTask.title,
    },
  });

  return {
    id: dep.id,
    taskId: dep.taskId,
    dependsOnTaskId: dep.dependsOnTaskId,
    createdAt: dep.createdAt.toISOString(),
    dependsOnTaskTitle: dependsOnTask.title,
    dependsOnTaskStatus: dependsOnTask.status as any,
  };
}

/**
 * Remove a dependency link (P4-1).
 */
export async function removeDependency(
  userId: string,
  taskId: string,
  dependsOnTaskId: string,
): Promise<{ success: boolean }> {
  // Ensure both tasks exist and belong to user
  const [task, dependsOnTask] = await Promise.all([
    taskRepo.findTaskByIdOrThrow(taskId, userId),
    taskRepo.findTaskByIdOrThrow(dependsOnTaskId, userId),
  ]);

  const removed = await taskRepo.deleteTaskDependency(taskId, dependsOnTaskId);
  if (!removed) {
    throw new NotFoundError('Task dependency', `${taskId}->${dependsOnTaskId}`);
  }

  // Log activity event
  await db.insert(activityEvents).values({
    userId,
    eventType: 'TASK_UPDATED' satisfies EventType,
    entityType: 'task' satisfies EntityType,
    entityId: taskId,
    projectId: task.projectId,
    summary: `Removed dependency: "${task.title}" no longer depends on "${dependsOnTask.title}"`,
    metadata: {
      action: 'REMOVE_DEPENDENCY',
      dependsOnTaskId,
    },
  });

  return { success: true };
}

/**
 * Get dependency details for a task (prerequisites and dependents).
 */
export async function getTaskDependencies(
  userId: string,
  taskId: string,
): Promise<{
  dependencies: TaskDependencyDto[];
  dependents: TaskDependencyDto[];
}> {
  await taskRepo.findTaskByIdOrThrow(taskId, userId);

  const [prereqRows, depRows] = await Promise.all([
    taskRepo.listTaskPrerequisites(taskId),
    taskRepo.listTaskDependents(taskId),
  ]);

  return {
    dependencies: prereqRows.map((r) => ({
      id: r.dependency.id,
      taskId: r.dependency.taskId,
      dependsOnTaskId: r.dependency.dependsOnTaskId,
      createdAt: r.dependency.createdAt.toISOString(),
      dependsOnTaskTitle: r.task.title,
      dependsOnTaskStatus: r.task.status as any,
    })),
    dependents: depRows.map((r) => ({
      id: r.dependency.id,
      taskId: r.dependency.taskId,
      dependsOnTaskId: r.dependency.dependsOnTaskId,
      createdAt: r.dependency.createdAt.toISOString(),
      dependsOnTaskTitle: r.task.title,
      dependsOnTaskStatus: r.task.status as any,
    })),
  };
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
