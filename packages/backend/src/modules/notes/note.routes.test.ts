import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as noteService from './note.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type NoteDto } from '@lifeos/shared';

// Mock note.service.js
vi.mock('./note.service.js', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  listNotes: vi.fn(),
  searchNotes: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

describe('Note Routes Integration', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on POST /api/notes when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ title: 'Test' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on GET /api/notes with invalid token', async () => {
      const res = await request(app)
        .get('/api/notes')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/notes', () => {
    it('creates a note and returns 201 on valid input', async () => {
      const mockNote: NoteDto = {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Project Ideas',
        content: 'Building an offline-first mobile app',
        tags: ['ideas', 'mobile'],
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(noteService.createNote).mockResolvedValue(mockNote);

      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', authHeader)
        .send({
          title: 'Project Ideas',
          content: 'Building an offline-first mobile app',
          tags: ['ideas', 'mobile'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockNote);
      expect(noteService.createNote).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ title: 'Project Ideas' }),
      );
    });

    it('returns 400 when validation fails (empty title)', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', authHeader)
        .send({
          title: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/notes', () => {
    it('lists notes and returns 200 with paginated meta', async () => {
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Project Ideas',
            content: 'Building an offline-first mobile app',
            tags: ['ideas'],
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

      vi.mocked(noteService.listNotes).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/api/notes?page=1&limit=20')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /api/notes/search', () => {
    it('returns 200 with search results', async () => {
      const mockResponse = {
        success: true as const,
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Project Ideas',
            content: 'Building an offline-first mobile app',
            tags: ['ideas'],
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

      vi.mocked(noteService.searchNotes).mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/api/notes/search?q=mobile')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(noteService.searchNotes).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ q: 'mobile' }),
      );
    });

    it('returns 400 when search query q is missing or empty', async () => {
      const res = await request(app)
        .get('/api/notes/search?q=')
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/notes/:id', () => {
    it('returns 200 with the note if found', async () => {
      const noteId = '22222222-2222-2222-2222-222222222222';
      const mockNote = {
        id: noteId,
        title: 'Project Ideas',
        content: '',
        tags: [],
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(noteService.getNote).mockResolvedValue(mockNote);

      const res = await request(app)
        .get(`/api/notes/${noteId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(noteId);
    });

    it('returns 404 when note is not found', async () => {
      const noteId = '33333333-3333-3333-3333-333333333333';
      vi.mocked(noteService.getNote).mockRejectedValue(new NotFoundError('Note', noteId));

      const res = await request(app)
        .get(`/api/notes/${noteId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('soft-deletes note and returns 200', async () => {
      const noteId = '22222222-2222-2222-2222-222222222222';
      vi.mocked(noteService.deleteNote).mockResolvedValue({
        id: noteId,
        title: 'Project Ideas',
        content: '',
        tags: [],
        projectId: null,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .delete(`/api/notes/${noteId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Note deleted');
      expect(noteService.deleteNote).toHaveBeenCalledWith(userId, noteId);
    });
  });
});
