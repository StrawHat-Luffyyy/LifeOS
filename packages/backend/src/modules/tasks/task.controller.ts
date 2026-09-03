import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type TaskDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as taskService from './task.service.js';

/**
 * POST /api/tasks
 */
export async function create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await taskService.createTask(req.user.sub, req.body);
    const response: ApiResponse<TaskDto> = { success: true, data: task };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tasks
 */
export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await taskService.listTasks(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tasks/:id
 */
export async function getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await taskService.getTask(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<TaskDto> = { success: true, data: task };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/tasks/:id
 */
export async function update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await taskService.updateTask(req.user.sub, req.params['id'] as string, req.body);
    const response: ApiResponse<TaskDto> = { success: true, data: task };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/tasks/:id
 */
export async function remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await taskService.deleteTask(req.user.sub, req.params['id'] as string);
    res.status(200).json({ success: true, data: { message: 'Task deleted' } });
  } catch (err) {
    next(err);
  }
}
