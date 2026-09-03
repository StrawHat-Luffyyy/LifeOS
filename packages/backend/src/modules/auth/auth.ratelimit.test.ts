import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';

vi.mock('./auth.service.js', () => ({
  register: vi.fn(),
  login: vi.fn().mockResolvedValue({
    token: 'jwt',
    refreshToken: 'ref',
    user: { id: 'u1', email: 'a@b.com', name: 'A' },
  }),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

describe('Auth Rate Limiting (FR-AUTH-5, P0H-3)', () => {
  it('enforces 20 requests per 15-minute window and returns 429 on request 21', async () => {
    const app = createApp();
    const payload = { email: 'ratelimit@example.com', password: 'Password123!' };

    // Fire 20 requests within the threshold
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/auth/login').send(payload);
      expect(res.status).toBe(200);
    }

    // The 21st request must exceed the rate limit and return 429
    const limitedRes = await request(app).post('/api/auth/login').send(payload);

    expect(limitedRes.status).toBe(429);
    expect(limitedRes.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts, please try again later',
      },
    });
  });
});
