import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../lib/errors.js';

/** Payload shape stored in the JWT. */
export interface JwtPayload {
  sub: string; // user ID
  email: string;
}

/** Extended request type with authenticated user info. */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * JWT authentication middleware (FR-AUTH-4).
 *
 * Extracts the token from the Authorization header, verifies it,
 * and attaches `req.user` for downstream handlers.
 * Returns 401 on missing or invalid token.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed authorization header');
  }

  const token = header.slice(7); // Strip "Bearer "

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
