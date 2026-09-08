import { db } from '../../../../db/index.js';
import { activityEvents } from '../../../../db/schema/index.js';
import * as taskService from '../../../tasks/task.service.js';
import { type EventType, type EntityType, type TaskDto } from '@lifeos/shared';

/**
 * Accept a Planner Agent recommendation (P4-4, Addendum B-3).
 *
 * Side-effect: Explicitly moves the accepted task to status 'in-progress'
 * and records 'PLANNER_RECOMMENDATION_ACCEPTED' to the activity timeline.
 */
export async function acceptRecommendation(
  userId: string,
  taskId: string,
  rationale?: string,
): Promise<{ success: boolean; task: TaskDto }> {
  // Fetch existing task to ensure ownership
  const task = await taskService.getTask(userId, taskId);

  // Explicitly update task status to in-progress (B-3)
  const updatedTask = await taskService.updateTask(userId, taskId, {
    status: 'in-progress',
  });

  // Log explicit activity timeline entry (B-3)
  await db.insert(activityEvents).values({
    userId,
    eventType: 'PLANNER_RECOMMENDATION_ACCEPTED' satisfies EventType,
    entityType: 'task' satisfies EntityType,
    entityId: taskId,
    projectId: task.projectId,
    summary: `Accepted recommendation and moved task to in-progress: "${task.title}"`,
    metadata: {
      action: 'ACCEPT_AND_START',
      newStatus: 'in-progress',
      taskId,
      ...(rationale ? { rationale } : {}),
    },
  });

  return {
    success: true,
    task: updatedTask,
  };
}

/**
 * Reject a Planner Agent recommendation (P4-4).
 * Logs 'PLANNER_RECOMMENDATION_REJECTED' to the activity timeline without altering task state.
 */
export async function rejectRecommendation(
  userId: string,
  taskId: string,
  rationale?: string,
): Promise<{ success: boolean }> {
  const task = await taskService.getTask(userId, taskId);

  await db.insert(activityEvents).values({
    userId,
    eventType: 'PLANNER_RECOMMENDATION_REJECTED' satisfies EventType,
    entityType: 'task' satisfies EntityType,
    entityId: taskId,
    projectId: task.projectId,
    summary: `Rejected planner recommendation for task: "${task.title}"`,
    metadata: {
      action: 'REJECT_RECOMMENDATION',
      taskId,
      ...(rationale ? { rationale } : {}),
    },
  });

  return { success: true };
}
