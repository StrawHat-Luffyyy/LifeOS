import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as docService from './document.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type DocumentDto, type DocumentChunkDto } from '@lifeos/shared';

// Mock docService
vi.mock('./document.service.js', () => ({
  uploadDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  getDocumentChunks: vi.fn(),
}));

describe('Document Routes Integration (P3-5, FR-DOC)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on GET /api/documents without token', async () => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/documents', () => {
    it('uploads a valid txt file and returns 201', async () => {
      const mockDoc: DocumentDto = {
        id: '22222222-2222-2222-2222-222222222222',
        userId,
        projectId: null,
        title: 'Project Notes',
        fileName: 'notes.txt',
        fileType: 'txt',
        fileSize: 100,
        status: 'queued',
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(docService.uploadDocument).mockResolvedValue(mockDoc);

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', authHeader)
        .field('title', 'Project Notes')
        .attach('file', Buffer.from('Sample document content'), 'notes.txt');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockDoc.id);
      expect(res.body.data.status).toBe('queued');
    });

    it('rejects unsupported file formats with 400', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', authHeader)
        .attach('file', Buffer.from('image content'), 'photo.png');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/documents', () => {
    it('returns paginated list of documents', async () => {
      vi.mocked(docService.listDocuments).mockResolvedValue({
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const res = await request(app)
        .get('/api/documents?status=ready')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/documents/:id', () => {
    it('returns 404 on non-existent or foreign document (404 isolation)', async () => {
      vi.mocked(docService.getDocument).mockRejectedValue(
        new NotFoundError('Document', '99999999-9999-9999-9999-999999999999'),
      );

      const res = await request(app)
        .get('/api/documents/99999999-9999-9999-9999-999999999999')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/documents/:id/chunks', () => {
    it('returns chunk list for document', async () => {
      const mockChunks: DocumentChunkDto[] = [
        {
          id: 'chunk-1',
          documentVersionId: 'ver-1',
          documentId: '22222222-2222-2222-2222-222222222222',
          userId,
          projectId: null,
          content: 'First chunk of content',
          chunkIndex: 0,
          createdAt: new Date().toISOString(),
        },
      ];

      vi.mocked(docService.getDocumentChunks).mockResolvedValue(mockChunks);

      const res = await request(app)
        .get('/api/documents/22222222-2222-2222-2222-222222222222/chunks')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('First chunk of content');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('deletes document and returns 200', async () => {
      const mockDoc: DocumentDto = {
        id: '22222222-2222-2222-2222-222222222222',
        userId,
        projectId: null,
        title: 'Project Notes',
        fileName: 'notes.txt',
        fileType: 'txt',
        fileSize: 100,
        status: 'ready',
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(docService.deleteDocument).mockResolvedValue(mockDoc);

      const res = await request(app)
        .delete('/api/documents/22222222-2222-2222-2222-222222222222')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
