import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type IntegrationDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as integrationService from './integration.service.js';

/**
 * POST /api/integrations/github/connect
 */
export async function connect(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await integrationService.connectGitHub(req.user.sub, req.body.token);
    const response: ApiResponse<IntegrationDto> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/integrations/github/disconnect
 */
export async function disconnect(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await integrationService.disconnectGitHub(req.user.sub);
    const response: ApiResponse<{ disconnected: true }> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/integrations/github
 */
export async function getConnection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await integrationService.getConnection(req.user.sub);
    const response: ApiResponse<IntegrationDto | null> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
