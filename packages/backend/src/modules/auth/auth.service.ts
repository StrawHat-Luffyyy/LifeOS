import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, refreshTokens } from '../../db/schema/index.js';
import { config } from '../../config/index.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import { type RegisterInput, type LoginInput } from './auth.schema.js';
import { type AuthResponse, type RefreshTokenResponse } from '@lifeos/shared';

const SALT_ROUNDS = 12;

/**
 * Register a new user (FR-AUTH-1, FR-AUTH-2).
 *
 * - Hashes password with bcrypt (never stored in plaintext).
 * - Checks email uniqueness, throws ConflictError if taken.
 * - Issues a short-lived access token (15m JWT) and a long-lived refresh token (30d).
 */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (existing.length > 0) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      name: input.name,
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  if (!user) {
    throw new Error('Failed to create user');
  }

  const token = generateToken(user.id, user.email);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/**
 * Authenticate a user with email and password (FR-AUTH-1).
 *
 * - Compares password against stored bcrypt hash.
 * - Issues short-lived access token (15m JWT) and long-lived refresh token (30d).
 * - Returns generic "Invalid credentials" on failure (no email enumeration).
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email));

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = generateToken(user.id, user.email);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/**
 * Exchange a valid, unrevoked refresh token for a new access token (P0H-1).
 * Implements refresh token rotation: old token is revoked, new token is issued.
 */
export async function refresh(rawRefreshToken: string): Promise<RefreshTokenResponse> {
  const tokenHash = hashToken(rawRefreshToken);

  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));

  if (!record) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (record.revokedAt !== null) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  if (record.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token has expired');
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, record.userId));

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  // Revoke old refresh token (rotation)
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, record.id));

  // Issue new token pair
  const newAccessToken = generateToken(user.id, user.email);
  const newRefreshToken = await generateRefreshToken(user.id);

  return {
    token: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Revoke refresh token session (FR-AUTH-3, P0H-1).
 *
 * Sets `revokedAt = now()` on the target refresh token or all tokens for the user.
 */
export async function logout(rawRefreshToken?: string, userId?: string): Promise<void> {
  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
    return;
  }

  if (userId) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email } satisfies { sub: string; email: string },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function generateRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}
