import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as memoryService from './memory.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type MemoryDto } from '@lifeos/shared';

// Mock memory.service.js
vi.mock('./memory.service.js', () => ({
  createMemory: vi.fn(),
  getMemory: vi.fn(),
  listMemories: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

describe('Memory Routes Integration (P3-4, FR-MEM)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on POST /api/memories when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ category: 'fact', content: 'Test memory', sourceType: 'user' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on GET /api/memories with invalid token', async () => {
      const res = await request(app)
        .get('/api/memories')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/memories', () => {
    it('creates a memory and returns 201 on valid input', async () => {
      const mockMemory: MemoryDto = {
        id: '22222222-2222-2222-2222-222222222222',
        userId,
        category: 'preference',
        content: 'Prefers dark mode',
        sourceType: 'user',
        sourceId: null,
        supersededBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(memoryService.createMemory).mockResolvedValue(mockMemory);

      const res = await request(app)
        .post('/api/memories')
        .set('Authorization', authHeader)
        .send({
          category: 'preference',
          content: 'Prefers dark mode',
          sourceType: 'user',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockMemory.id);
      expect(res.body.data.category).toBe('preference');
    });

    it('returns 400 when invalid category is passed', async () => {
      const res = await request(app)
        .post('/api/memories')
        .set('Authorization', authHeader)
        .send({
          category: 'invalid-category',
          content: 'Some memory',
          sourceType: 'user',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/memories', () => {
    it('returns paginated list of memories', async () => {
      vi.mocked(memoryService.listMemories).mockResolvedValue({
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const res = await request(app)
        .get('/api/memories?category=goal&activeOnly=true')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/memories/:id', () => {
    it('returns 404 when memory does not exist or belongs to another user (404 isolation)', async () => {
      vi.mocked(memoryService.getMemory).mockRejectedValue(
        new NotFoundError('Memory', '99999999-9999-9999-9999-999999999999'),
      );

      const res = await request(app)
        .get('/api/memories/99999999-9999-9999-9999-999999999999')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/memories/:id', () => {
    it('soft-deletes memory and returns 200', async () => {
      const mockMemory: MemoryDto = {
        id: '22222222-2222-2222-2222-222222222222',
        userId,
        category: 'preference',
        content: 'To delete',
        sourceType: 'user',
        sourceId: null,
        supersededBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(memoryService.deleteMemory).mockResolvedValue(mockMemory);

      const res = await request(app)
        .delete('/api/memories/22222222-2222-2222-2222-222222222222')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
