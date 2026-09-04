import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type ProjectDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as projectService from './project.service.js';

/**
 * POST /api/projects
 */
export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.createProject(req.user.sub, req.body);
    const response: ApiResponse<ProjectDto> = { success: true, data: project };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/projects
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await projectService.listProjects(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/projects/:id
 */
export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.getProject(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<ProjectDto> = { success: true, data: project };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/projects/:id
 */
export async function update(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.updateProject(
      req.user.sub,
      req.params['id'] as string,
      req.body,
    );
    const response: ApiResponse<ProjectDto> = { success: true, data: project };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/projects/:id
 */
export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await projectService.deleteProject(req.user.sub, req.params['id'] as string);
    res.status(200).json({ success: true, data: { message: 'Project deleted' } });
  } catch (err) {
    next(err);
  }
}
