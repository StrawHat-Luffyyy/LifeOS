import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import * as authService from './auth.service.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';

vi.mock('./auth.service.js', () => ({
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

describe('Auth Routes Integration', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('returns 201 with tokens and user info on valid registration', async () => {
      const mockResult = {
        token: 'access-jwt-token',
        refreshToken: 'refresh-token-opaque',
        user: { id: 'u-1', email: 'alice@example.com', name: 'Alice' },
      };

      vi.mocked(authService.register).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
      expect(authService.register).toHaveBeenCalledWith({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });
    });

    it('returns 409 when email already exists', async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new ConflictError('An account with this email already exists'),
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'duplicate@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns 400 when validation fails (invalid email)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'not-an-email',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password is under 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 with tokens on valid credentials', async () => {
      const mockResult = {
        token: 'access-jwt-token',
        refreshToken: 'refresh-token-opaque',
        user: { id: 'u-1', email: 'alice@example.com', name: 'Alice' },
      };

      vi.mocked(authService.login).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
    });

    it('returns 401 when password or email is invalid', async () => {
      vi.mocked(authService.login).mockRejectedValue(
        new UnauthorizedError('Invalid email or password'),
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'WrongPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with rotated tokens on valid refresh token', async () => {
      const mockResult = {
        token: 'new-access-jwt',
        refreshToken: 'new-refresh-token',
      };

      vi.mocked(authService.refresh).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-old-refresh-token',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
      expect(authService.refresh).toHaveBeenCalledWith('valid-old-refresh-token');
    });

    it('returns 401 when refresh token is invalid or revoked', async () => {
      vi.mocked(authService.refresh).mockRejectedValue(
        new UnauthorizedError('Refresh token has been revoked'),
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'revoked-token',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when refreshToken is missing in body', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 200 and revokes token', async () => {
      vi.mocked(authService.logout).mockResolvedValue();

      const res = await request(app)
        .post('/api/auth/logout')
        .send({
          refreshToken: 'token-to-revoke',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
      expect(authService.logout).toHaveBeenCalledWith('token-to-revoke', undefined);
    });
  });
});
