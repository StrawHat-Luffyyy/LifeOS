import { type Request, type Response, type NextFunction } from 'express';
import { type ApiErrorResponse } from '@lifeos/shared';
import { AppError } from '../lib/errors.js';
import { config } from '../config/index.js';

/**
 * Centralized error handler (NFR-2).
 *
 * - Operational errors (AppError subclasses) → return typed JSON with their status code.
 * - Unknown errors → log the real error, return a generic 500. Never leak internals.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Operational / expected errors
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected / programming errors — log but don't expose details
  console.error('Unhandled error:', err);

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        config.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message || 'An unexpected error occurred',
    },
  };
  res.status(500).json(body);
}
