import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as activityService from './activity.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';

// Mock activity.service.js
vi.mock('./activity.service.js', () => ({
  listActivity: vi.fn(),
  listProjectActivity: vi.fn(),
}));

describe('Activity Routes Integration', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/activity', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/activity');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with paginated activity events', async () => {
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: 'event-1',
            userId,
            eventType: 'TASK_CREATED' as const,
            entityType: 'task' as const,
            entityId: 'task-1',
            projectId: null,
            summary: 'Created task: Buy groceries',
            metadata: null,
            createdAt: new Date().toISOString(),
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(activityService.listActivity).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/api/activity?page=1&limit=20')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
      expect(activityService.listActivity).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  describe('GET /api/projects/:id/activity', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/projects/22222222-2222-2222-2222-222222222222/activity');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with project activity events', async () => {
      const projectId = '22222222-2222-2222-2222-222222222222';
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: 'event-2',
            userId,
            eventType: 'PROJECT_CREATED' as const,
            entityType: 'project' as const,
            entityId: projectId,
            projectId,
            summary: 'Created project: LifeOS Core',
            metadata: null,
            createdAt: new Date().toISOString(),
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(activityService.listProjectActivity).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get(`/api/projects/${projectId}/activity?page=1&limit=20`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(activityService.listProjectActivity).toHaveBeenCalledWith(
        userId,
        projectId,
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('returns 404 when project does not exist or belong to user', async () => {
      const projectId = '33333333-3333-3333-3333-333333333333';
      vi.mocked(activityService.listProjectActivity).mockRejectedValue(
        new NotFoundError('Project', projectId),
      );

      const res = await request(app)
        .get(`/api/projects/${projectId}/activity`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
