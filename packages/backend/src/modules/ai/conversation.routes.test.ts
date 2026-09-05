import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as conversationService from './conversation.service.js';
import * as chatService from './chat.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { type ConversationDto, type ConversationWithMessagesDto } from '@lifeos/shared';

vi.mock('./conversation.service.js');
vi.mock('./chat.service.js');

describe('Conversation Routes Integration (P2-2, P2-3, A-4)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;
  const conversationId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication protection', () => {
    it('returns 401 on POST /api/conversations when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({ title: 'New Chat' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on GET /api/conversations with invalid token', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/conversations', () => {
    it('creates a conversation and returns 201 on valid input', async () => {
      const mockConv: ConversationDto = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'Project Planning',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      vi.mocked(conversationService.createConversation).mockResolvedValue(mockConv);

      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', authHeader)
        .send({ title: 'Project Planning' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Project Planning');
      expect(conversationService.createConversation).toHaveBeenCalledWith(userId, {
        title: 'Project Planning',
      });
    });

    it('returns 404 NOT_FOUND when creating a conversation with a foreign projectId (A-4)', async () => {
      const foreignProjectId = '33333333-3333-3333-3333-333333333333';
      vi.mocked(conversationService.createConversation).mockRejectedValue(
        new NotFoundError('Project not found'),
      );

      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', authHeader)
        .send({ title: 'Project Chat', projectId: foreignProjectId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/conversations', () => {
    it('lists conversations for the authenticated user', async () => {
      const mockList = {
        success: true as const,
        data: [
          {
            id: conversationId,
            userId,
            projectId: null,
            title: 'Chat 1',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      vi.mocked(conversationService.listConversations).mockResolvedValue(mockList);

      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/conversations/:id (Tenant Isolation)', () => {
    it('returns 200 with conversation messages for owner', async () => {
      const mockConv: ConversationWithMessagesDto = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'Chat 1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        messages: [],
      };

      vi.mocked(conversationService.getConversation).mockResolvedValue(mockConv);

      const res = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(conversationId);
    });

    it('returns 404 NOT_FOUND on cross-user access (not 403)', async () => {
      vi.mocked(conversationService.getConversation).mockRejectedValue(
        new NotFoundError('Conversation not found'),
      );

      const res = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/conversations/:id', () => {
    it('updates conversation title', async () => {
      const updated: ConversationDto = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'Renamed Chat',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:01:00.000Z',
      };

      vi.mocked(conversationService.updateConversation).mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/conversations/${conversationId}`)
        .set('Authorization', authHeader)
        .send({ title: 'Renamed Chat' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Renamed Chat');
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('soft deletes conversation', async () => {
      vi.mocked(conversationService.deleteConversation).mockResolvedValue();

      const res = await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/conversations/:id/messages (SSE Streaming P2-3)', () => {
    it('returns text/event-stream and streams chat events', async () => {
      vi.mocked(conversationService.getConversation).mockResolvedValue({
        id: conversationId,
        userId,
        projectId: null,
        title: 'Chat',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        messages: [],
      });

      async function* mockStreamGenerator() {
        yield { type: 'message_start' as const, messageId: 'msg-new' };
        yield { type: 'token' as const, content: 'Hello ' };
        yield { type: 'token' as const, content: 'world!' };
      }

      vi.mocked(chatService.streamChatMessage).mockImplementation(
        () => mockStreamGenerator() as any,
      );

      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', authHeader)
        .send({ content: 'Hello AI' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: message_start');
      expect(res.text).toContain('event: token');
      expect(res.text).toContain('world!');
      expect(res.text).toContain('data: [DONE]');
    });

    it('returns 404 when sending a message to a foreign conversation', async () => {
      vi.mocked(conversationService.getConversation).mockRejectedValue(
        new NotFoundError('Conversation not found'),
      );

      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', authHeader)
        .send({ content: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
