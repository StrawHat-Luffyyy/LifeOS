import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as githubLinkService from './github-link.service.js';
import * as githubSyncService from './github-sync.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';

vi.mock('./github-link.service.js', () => ({
  linkRepo: vi.fn(),
  unlinkRepo: vi.fn(),
  getLink: vi.fn(),
}));

vi.mock('./github-sync.service.js', () => ({
  syncLinkedRepo: vi.fn(),
  getProjectGitHubData: vi.fn(),
}));

describe('Project GitHub Routes (/api/projects/:id/github)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get(`/api/projects/${projectId}/github`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/projects/:id/github/link', () => {
    it('validates request body and rejects empty fields with 400', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/github/link`)
        .set('Authorization', authHeader)
        .send({ repoOwner: '', repoName: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('links repository and returns 201 on valid input', async () => {
      vi.mocked(githubLinkService.linkRepo).mockResolvedValue({
        id: 'link-123',
        projectId,
        userId,
        repoOwner: 'StrawHat-Luffyyy',
        repoName: 'LifeOS',
        repoUrl: 'https://github.com/StrawHat-Luffyyy/LifeOS',
        linkedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/github/link`)
        .set('Authorization', authHeader)
        .send({ repoOwner: 'StrawHat-Luffyyy', repoName: 'LifeOS' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.repoName).toBe('LifeOS');
      expect(githubLinkService.linkRepo).toHaveBeenCalledWith(userId, projectId, 'StrawHat-Luffyyy', 'LifeOS');
    });

    it('returns 404 when project does not exist (tenant isolation)', async () => {
      vi.mocked(githubLinkService.linkRepo).mockRejectedValue(new NotFoundError('Project', projectId));

      const res = await request(app)
        .post(`/api/projects/${projectId}/github/link`)
        .set('Authorization', authHeader)
        .send({ repoOwner: 'StrawHat-Luffyyy', repoName: 'LifeOS' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/:id/github/link', () => {
    it('unlinks repository and returns 200', async () => {
      vi.mocked(githubLinkService.unlinkRepo).mockResolvedValue({ unlinked: true });

      const res = await request(app)
        .delete(`/api/projects/${projectId}/github/link`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unlinked).toBe(true);
      expect(githubLinkService.unlinkRepo).toHaveBeenCalledWith(userId, projectId);
    });

    it('returns 404 if project has no linked repo', async () => {
      vi.mocked(githubLinkService.unlinkRepo).mockRejectedValue(
        new NotFoundError('Linked GitHub repository for this project'),
      );

      const res = await request(app)
        .delete(`/api/projects/${projectId}/github/link`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/projects/:id/github', () => {
    it('returns 200 with GitHub data for the project', async () => {
      vi.mocked(githubSyncService.getProjectGitHubData).mockResolvedValue({
        link: {
          id: 'link-1',
          projectId,
          userId,
          repoOwner: 'StrawHat-Luffyyy',
          repoName: 'LifeOS',
          repoUrl: 'https://github.com/StrawHat-Luffyyy/LifeOS',
          linkedAt: new Date().toISOString(),
        },
        issues: [
          {
            id: 'i-1',
            projectId,
            userId,
            number: 10,
            title: 'Test issue',
            state: 'open',
            url: 'https://github.com/StrawHat-Luffyyy/LifeOS/issues/10',
            labels: ['bug'],
            author: 'alice',
            lastSyncedAt: new Date().toISOString(),
          },
        ],
        pullRequests: [],
        lastSyncedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get(`/api/projects/${projectId}/github`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.link.repoName).toBe('LifeOS');
      expect(res.body.data.issues).toHaveLength(1);
    });
  });

  describe('POST /api/projects/:id/github/sync', () => {
    it('triggers manual sync and returns 200 with sync results', async () => {
      vi.mocked(githubSyncService.syncLinkedRepo).mockResolvedValue({
        syncedAt: new Date().toISOString(),
        issueCount: 5,
        prCount: 2,
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/github/sync`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.issueCount).toBe(5);
      expect(res.body.data.prCount).toBe(2);
      expect(githubSyncService.syncLinkedRepo).toHaveBeenCalledWith(userId, projectId);
    });
  });
});
