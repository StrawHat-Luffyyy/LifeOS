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

// ---------------------------------------------------------------------------
// Google OAuth & Calendar Endpoints
// ---------------------------------------------------------------------------

import * as googleOAuthService from './google-oauth.service.js';
import { config } from '../../config/index.js';
import { type Request } from 'express';

/**
 * GET /api/integrations/google/auth-url
 */
export async function getGoogleAuthUrl(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const url = googleOAuthService.generateAuthUrl(req.user.sub);
    const response: ApiResponse<{ url: string }> = { success: true, data: { url } };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/integrations/google/callback
 */
export async function googleCallback(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const code = req.query['code'] as string | undefined;
  const state = req.query['state'] as string | undefined;
  const error = req.query['error'] as string | undefined;

  if (error || !code || !state) {
    const errorMsg = error || 'Missing authorization code or state from Google callback';
    if (req.headers.accept?.includes('application/json')) {
      res.status(400).json({ success: false, error: { message: errorMsg, code: 'OAUTH_CALLBACK_ERROR' } });
      return;
    }
    res.redirect(`${config.FRONTEND_URL}/dashboard?integration=google&status=error&message=${encodeURIComponent(errorMsg)}`);
    return;
  }

  try {
    const integration = await googleOAuthService.handleOAuthCallback(code, state);

    if (req.headers.accept?.includes('application/json')) {
      res.status(200).json({ success: true, data: integration });
      return;
    }

    res.redirect(`${config.FRONTEND_URL}/dashboard?integration=google&status=success`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect Google Calendar';
    if (req.headers.accept?.includes('application/json')) {
      res.status(400).json({ success: false, error: { message, code: 'OAUTH_CALLBACK_FAILED' } });
      return;
    }
    res.redirect(`${config.FRONTEND_URL}/dashboard?integration=google&status=error&message=${encodeURIComponent(message)}`);
  }
}

/**
 * GET /api/integrations/google
 */
export async function getGoogleConnection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await googleOAuthService.getGoogleConnection(req.user.sub);
    const response: ApiResponse<IntegrationDto | null> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/integrations/google/disconnect
 */
export async function disconnectGoogle(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await googleOAuthService.disconnectGoogleCalendar(req.user.sub);
    const response: ApiResponse<{ disconnected: true }> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
