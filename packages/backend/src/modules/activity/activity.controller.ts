import { type Response, type NextFunction } from 'express';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as activityService from './activity.service.js';

/**
 * GET /api/activity
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await activityService.listActivity(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/projects/:id/activity
 */
export async function listByProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await activityService.listProjectActivity(
      req.user.sub,
      req.params['id'] as string,
      req.query as never,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
