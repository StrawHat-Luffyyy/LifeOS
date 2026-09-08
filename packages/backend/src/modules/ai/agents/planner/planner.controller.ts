import { type Response, type NextFunction } from 'express';
import { type AuthenticatedRequest } from '../../../../middleware/auth.js';
import { runPlanner } from './planner.graph.js';
import * as plannerService from './planner.service.js';

/**
 * POST /api/planner
 * Run the Planner Agent workflow.
 */
export async function run(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { projectId, focus } = req.body ?? {};
    const execution = await runPlanner(req.user.sub, projectId, focus);
    res.status(200).json({ success: true, data: execution });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/planner/recommendations/:taskId/accept
 * Accept a Planner Agent recommendation (explicitly moving to in-progress, B-3).
 */
export async function accept(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskId } = req.params;
    const { rationale } = req.body ?? {};
    const result = await plannerService.acceptRecommendation(
      req.user.sub,
      taskId as string,
      rationale,
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/planner/recommendations/:taskId/reject
 * Reject a Planner Agent recommendation.
 */
export async function reject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskId } = req.params;
    const { rationale } = req.body ?? {};
    const result = await plannerService.rejectRecommendation(
      req.user.sub,
      taskId as string,
      rationale,
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
