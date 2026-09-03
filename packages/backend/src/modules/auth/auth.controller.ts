import { type Request, type Response, type NextFunction } from 'express';
import { type ApiResponse, type AuthResponse, type RefreshTokenResponse } from '@lifeos/shared';
import * as authService from './auth.service.js';
import { type RegisterInput, type LoginInput, type RefreshTokenInput, type LogoutInput } from './auth.schema.js';
import { type AuthenticatedRequest } from '../../middleware/auth.js';

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body as RegisterInput);
    const response: ApiResponse<AuthResponse> = { success: true, data: result };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body as LoginInput);
    const response: ApiResponse<AuthResponse> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as RefreshTokenInput;
    const result = await authService.refresh(refreshToken);
    const response: ApiResponse<RefreshTokenResponse> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as LogoutInput;
    const userId = (req as Partial<AuthenticatedRequest>).user?.sub;
    await authService.logout(body.refreshToken, userId);
    res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
}
