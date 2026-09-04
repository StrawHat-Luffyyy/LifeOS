import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as projectService from './project.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type ProjectDto } from '@lifeos/shared';

// Mock project.service.js
vi.mock('./project.service.js', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

describe('Project Routes Integration', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on POST /api/projects when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on GET /api/projects with invalid token', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project and returns 201 on valid input', async () => {
      const mockProject: ProjectDto = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Alpha Launch',
        description: 'Launch Q1 product',
        status: 'active',
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(projectService.createProject).mockResolvedValue(mockProject);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Alpha Launch',
          description: 'Launch Q1 product',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockProject);
      expect(projectService.createProject).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ name: 'Alpha Launch' }),
      );
    });

    it('returns 400 when validation fails (empty name)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/projects', () => {
    it('lists projects and returns 200 with paginated meta', async () => {
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Alpha Launch',
            description: null,
            status: 'active' as const,
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(projectService.listProjects).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/api/projects?page=1&limit=20')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns 200 with the project if found', async () => {
      const projectId = '22222222-2222-2222-2222-222222222222';
      const mockProject = {
        id: projectId,
        name: 'Alpha Launch',
        description: null,
        status: 'active' as const,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(projectService.getProject).mockResolvedValue(mockProject);

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(projectId);
    });

    it('returns 404 when project is not found', async () => {
      const projectId = '33333333-3333-3333-3333-333333333333';
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project', projectId));

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('soft-deletes project and returns 200', async () => {
      const projectId = '22222222-2222-2222-2222-222222222222';
      vi.mocked(projectService.deleteProject).mockResolvedValue({
        id: projectId,
        name: 'Alpha Launch',
        description: null,
        status: 'active' as const,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Project deleted');
      expect(projectService.deleteProject).toHaveBeenCalledWith(userId, projectId);
    });
  });
});
