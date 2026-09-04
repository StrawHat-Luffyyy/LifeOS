import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as taskService from './task.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type TaskDto } from '@lifeos/shared';

// Mock task.service.js
vi.mock('./task.service.js', () => ({
  createTask: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

describe('Task Routes Integration', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on POST /api/tasks when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Test' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on GET /api/tasks with invalid token', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/tasks', () => {
    it('creates a task and returns 201 on valid input', async () => {
      const mockTask: TaskDto = {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Review PRD',
        description: 'Check acceptance criteria',
        dueDate: null,
        priority: 'high',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(taskService.createTask).mockResolvedValue(mockTask);

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', authHeader)
        .send({
          title: 'Review PRD',
          description: 'Check acceptance criteria',
          priority: 'high',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockTask);
      expect(taskService.createTask).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ title: 'Review PRD', priority: 'high' }),
      );
    });

    it('returns 400 when validation fails (empty title)', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', authHeader)
        .send({
          title: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when task is created with a foreign or non-existent projectId', async () => {
      const foreignProjectId = '99999999-9999-9999-9999-999999999999';
      vi.mocked(taskService.createTask).mockRejectedValue(new NotFoundError('Project', foreignProjectId));

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', authHeader)
        .send({
          title: 'Unauthorized Project Task',
          projectId: foreignProjectId,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(taskService.createTask).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ title: 'Unauthorized Project Task', projectId: foreignProjectId }),
      );
    });
  });

  describe('GET /api/tasks', () => {
    it('lists tasks and returns 200 with paginated meta', async () => {
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Sample Task',
            description: null,
            dueDate: null,
            priority: 'medium' as const,
            status: 'todo' as const,
            projectId: null,
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

      vi.mocked(taskService.listTasks).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/api/tasks?page=1&limit=20')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns 200 with the task if found', async () => {
      const taskId = '22222222-2222-2222-2222-222222222222';
      const mockTask = {
        id: taskId,
        title: 'Sample Task',
        description: null,
        dueDate: null,
        priority: 'medium' as const,
        status: 'todo' as const,
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(taskService.getTask).mockResolvedValue(mockTask);

      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(taskId);
    });

    it('returns 404 when task is not found', async () => {
      const taskId = '33333333-3333-3333-3333-333333333333';
      vi.mocked(taskService.getTask).mockRejectedValue(new NotFoundError('Task', taskId));

      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('soft-deletes task and returns 200', async () => {
      const taskId = '22222222-2222-2222-2222-222222222222';
      vi.mocked(taskService.deleteTask).mockResolvedValue({
        id: taskId,
        title: 'Sample Task',
        description: null,
        dueDate: null,
        priority: 'medium' as const,
        status: 'todo' as const,
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Task deleted');
      expect(taskService.deleteTask).toHaveBeenCalledWith(userId, taskId);
    });
  });
});
