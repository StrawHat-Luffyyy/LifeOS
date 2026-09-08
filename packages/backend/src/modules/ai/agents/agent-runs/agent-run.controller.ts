import { type Response, type NextFunction } from 'express';
import { type AuthenticatedRequest } from '../../../../middleware/auth.js';
import * as agentRunService from './agent-run.service.js';

/**
 * GET /api/agent-runs
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await agentRunService.listAgentRuns(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agent-runs/:id
 */
export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const run = await agentRunService.getAgentRun(req.user.sub, req.params['id'] as string);
    res.status(200).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
}
