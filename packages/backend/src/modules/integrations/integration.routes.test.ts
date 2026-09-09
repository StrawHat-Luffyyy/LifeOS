import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as integrationService from './integration.service.js';
import { config } from '../../config/index.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';

vi.mock('./integration.service.js', () => ({
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  getConnection: vi.fn(),
  getDecryptedToken: vi.fn(),
}));

describe('Integration Routes (/api/integrations)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when Authorization header is omitted', async () => {
      const res = await request(app).get('/api/integrations/github');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/integrations/github/connect', () => {
    it('validates request body and rejects empty token with 400', async () => {
      const res = await request(app)
        .post('/api/integrations/github/connect')
        .set('Authorization', authHeader)
        .send({ token: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('connects GitHub and returns 200 with integration data', async () => {
      vi.mocked(integrationService.connectGitHub).mockResolvedValue({
        id: 'int-123',
        userId,
        provider: 'github',
        metadata: { username: 'octocat' },
        connectedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/integrations/github/connect')
        .set('Authorization', authHeader)
        .send({ token: 'ghp_validToken' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metadata.username).toBe('octocat');
      expect(integrationService.connectGitHub).toHaveBeenCalledWith(userId, 'ghp_validToken');
    });

    it('returns 401 when service throws UnauthorizedError (invalid PAT)', async () => {
      vi.mocked(integrationService.connectGitHub).mockRejectedValue(
        new UnauthorizedError('Invalid or expired GitHub Personal Access Token'),
      );

      const res = await request(app)
        .post('/api/integrations/github/connect')
        .set('Authorization', authHeader)
        .send({ token: 'ghp_invalid' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid or expired GitHub Personal Access Token');
    });
  });

  describe('DELETE /api/integrations/github/disconnect', () => {
    it('disconnects GitHub integration and returns 200', async () => {
      vi.mocked(integrationService.disconnectGitHub).mockResolvedValue({ disconnected: true });

      const res = await request(app)
        .delete('/api/integrations/github/disconnect')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.disconnected).toBe(true);
      expect(integrationService.disconnectGitHub).toHaveBeenCalledWith(userId);
    });

    it('returns 404 when no integration exists to disconnect', async () => {
      vi.mocked(integrationService.disconnectGitHub).mockRejectedValue(
        new NotFoundError('GitHub integration'),
      );

      const res = await request(app)
        .delete('/api/integrations/github/disconnect')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/integrations/github', () => {
    it('returns 200 with null when not connected', async () => {
      vi.mocked(integrationService.getConnection).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/integrations/github')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('returns 200 with integration data when connected', async () => {
      vi.mocked(integrationService.getConnection).mockResolvedValue({
        id: 'int-123',
        userId,
        provider: 'github',
        metadata: { username: 'octocat' },
        connectedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get('/api/integrations/github')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metadata.username).toBe('octocat');
    });
  });
});
