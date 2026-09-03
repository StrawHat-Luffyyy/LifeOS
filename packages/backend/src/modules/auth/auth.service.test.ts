import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Mock the database module
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  users: { id: 'id', email: 'email', passwordHash: 'password_hash', name: 'name' },
  refreshTokens: {
    id: 'id',
    userId: 'user_id',
    tokenHash: 'token_hash',
    expiresAt: 'expires_at',
    revokedAt: 'revoked_at',
  },
}));

const { register, login, refresh, logout } = await import('./auth.service.js');

describe('AuthService Unit Tests', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const email = 'user@example.com';
  const password = 'Password123!';
  const name = 'Test User';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('successfully registers user and returns access + refresh tokens', async () => {
      // 1. Check if email exists -> returns empty array
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      // 2. Insert user
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([{ id: userId, email, name }]),
        }),
      });

      // 3. Insert refresh token
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValueOnce([]),
      });

      const res = await register({ email, password, name });

      expect(res.user).toEqual({ id: userId, email, name });
      expect(typeof res.token).toBe('string');
      expect(typeof res.refreshToken).toBe('string');
      expect(res.refreshToken).toHaveLength(80); // 40 bytes hex = 80 chars
    });

    it('throws ConflictError when email is already registered', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([{ id: 'existing-id' }]),
        }),
      });

      await expect(register({ email, password, name })).rejects.toThrow(
        'An account with this email already exists',
      );
    });
  });

  describe('login', () => {
    it('successfully authenticates with valid credentials', async () => {
      const passwordHash = await bcrypt.hash(password, 10);

      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([
            { id: userId, email, passwordHash, name },
          ]),
        }),
      });

      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValueOnce([]),
      });

      const res = await login({ email, password });

      expect(res.user).toEqual({ id: userId, email, name });
      expect(typeof res.token).toBe('string');
      expect(typeof res.refreshToken).toBe('string');
    });

    it('throws UnauthorizedError when email is not found', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      await expect(login({ email, password })).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('throws UnauthorizedError when password does not match', async () => {
      const wrongHash = await bcrypt.hash('DifferentPassword', 10);

      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([
            { id: userId, email, passwordHash: wrongHash, name },
          ]),
        }),
      });

      await expect(login({ email, password })).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  describe('refresh', () => {
    const rawToken = 'a'.repeat(80);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    it('successfully exchanges valid refresh token for new access and rotated refresh token', async () => {
      // 1. Find refresh token record
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([
            {
              id: 'token-uuid',
              userId,
              tokenHash,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60), // valid for 1h
              revokedAt: null,
            },
          ]),
        }),
      });

      // 2. Find user
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([{ id: userId, email }]),
        }),
      });

      // 3. Revoke old refresh token
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      // 4. Insert new refresh token (rotation)
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValueOnce([]),
      });

      const res = await refresh(rawToken);

      expect(typeof res.token).toBe('string');
      expect(typeof res.refreshToken).toBe('string');
      expect(res.refreshToken).toHaveLength(80);
      expect(mockUpdate).toHaveBeenCalledOnce(); // rotation: revoked old
    });

    it('throws UnauthorizedError when token is not found in database', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      await expect(refresh(rawToken)).rejects.toThrow('Invalid refresh token');
    });

    it('throws UnauthorizedError when refresh token has been revoked', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([
            {
              id: 'token-uuid',
              userId,
              tokenHash,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60),
              revokedAt: new Date('2025-01-01'), // already revoked!
            },
          ]),
        }),
      });

      await expect(refresh(rawToken)).rejects.toThrow('Refresh token has been revoked');
    });

    it('throws UnauthorizedError when refresh token has expired', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([
            {
              id: 'token-uuid',
              userId,
              tokenHash,
              expiresAt: new Date(Date.now() - 1000), // expired!
              revokedAt: null,
            },
          ]),
        }),
      });

      await expect(refresh(rawToken)).rejects.toThrow('Refresh token has expired');
    });
  });

  describe('logout', () => {
    it('sets revokedAt on the token with matching hash', async () => {
      const rawToken = 'b'.repeat(80);

      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      await logout(rawToken);

      expect(mockUpdate).toHaveBeenCalledOnce();
    });

    it('sets revokedAt on all user tokens when userId is provided without refreshToken', async () => {
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      await logout(undefined, userId);

      expect(mockUpdate).toHaveBeenCalledOnce();
    });
  });
});
