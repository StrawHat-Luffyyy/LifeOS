import { type Request, type Response, type NextFunction } from 'express';
import { type ApiResponse, type AuthResponse } from '@lifeos/shared';
import * as authService from './auth.service.js';
import { type RegisterInput, type LoginInput } from './auth.schema.js';

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
