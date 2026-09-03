import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { config } from '../../config/index.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import { type RegisterInput, type LoginInput } from './auth.schema.js';
import { type AuthResponse } from '@lifeos/shared';

const SALT_ROUNDS = 12;

/**
 * Register a new user (FR-AUTH-1, FR-AUTH-2).
 *
 * - Hashes password with bcrypt (never stored in plaintext).
 * - Checks email uniqueness, throws ConflictError if taken.
 * - Returns JWT + user info.
 */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  // Check if email is already registered
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

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/**
 * Authenticate a user with email and password (FR-AUTH-1).
 *
 * - Compares password against stored bcrypt hash.
 * - Returns JWT + user info on success.
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

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

function generateToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email } satisfies { sub: string; email: string },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}
