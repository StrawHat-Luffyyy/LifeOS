import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as conversationService from './conversation.service.js';
import * as conversationRepo from './conversation.repository.js';
import * as projectService from '../projects/project.service.js';
import { NotFoundError } from '../../lib/errors.js';

vi.mock('./conversation.repository.js');
vi.mock('../projects/project.service.js');

describe('ConversationService (P2-2, A-4)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const foreignUserId = '99999999-9999-9999-9999-999999999999';
  const conversationId = '22222222-2222-2222-2222-222222222222';
  const projectId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConversation', () => {
    it('creates a conversation successfully', async () => {
      const mockRow: conversationRepo.ConversationRow = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'My Chat',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(conversationRepo.insertConversation).mockResolvedValue(mockRow);

      const result = await conversationService.createConversation(userId, { title: 'My Chat' });

      expect(result).toEqual({
        id: conversationId,
        userId,
        projectId: null,
        title: 'My Chat',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
    });

    it('rejects creating a conversation with another user’s projectId with 404 (A-4)', async () => {
      vi.mocked(projectService.getProject).mockRejectedValue(
        new NotFoundError('Project not found'),
      );

      await expect(
        conversationService.createConversation(userId, {
          title: 'Project Chat',
          projectId,
        }),
      ).rejects.toThrow('Project not found');

      expect(projectService.getProject).toHaveBeenCalledWith(userId, projectId);
      expect(conversationRepo.insertConversation).not.toHaveBeenCalled();
    });
  });

  describe('getConversation (Tenant Isolation)', () => {
    it('returns conversation with messages and tool calls when owner requests it', async () => {
      const mockRow: conversationRepo.ConversationRow = {
        id: conversationId,
        userId,
        projectId,
        title: 'My Chat',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      const msgId = 'msg-1';
      const mockMessages: conversationRepo.MessageRow[] = [
        {
          id: msgId,
          conversationId,
          role: 'assistant',
          content: 'Hello!',
          status: 'completed',
          createdAt: new Date('2025-01-01T00:01:00Z'),
        },
      ];

      const mockTools: conversationRepo.ToolCallRow[] = [
        {
          id: 'tc-1',
          conversationId,
          messageId: msgId,
          toolName: 'createTask',
          riskTier: 'WRITE',
          input: { title: 'T1' },
          output: { success: true },
          createdAt: new Date('2025-01-01T00:00:50Z'),
        },
      ];

      vi.mocked(conversationRepo.findConversationById).mockResolvedValue(mockRow);
      vi.mocked(conversationRepo.listMessagesByConversation).mockResolvedValue(mockMessages);
      vi.mocked(conversationRepo.listToolCallsByConversation).mockResolvedValue(mockTools);

      const result = await conversationService.getConversation(userId, conversationId);

      expect(result.id).toBe(conversationId);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.toolCalls).toHaveLength(1);
      expect(result.messages[0]?.toolCalls?.[0]?.toolName).toBe('createTask');
    });

    it('returns 404 NOT_FOUND on cross-user access (not 403)', async () => {
      // Repository query enforces userId, so it returns undefined for foreign user
      vi.mocked(conversationRepo.findConversationById).mockResolvedValue(undefined);

      await expect(
        conversationService.getConversation(foreignUserId, conversationId),
      ).rejects.toThrow('Conversation not found');

      expect(conversationRepo.findConversationById).toHaveBeenCalledWith(conversationId, foreignUserId);
    });
  });

  describe('updateConversation & deleteConversation', () => {
    it('updates conversation title', async () => {
      const mockRow: conversationRepo.ConversationRow = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'Updated Title',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:05:00Z'),
        deletedAt: null,
      };

      vi.mocked(conversationRepo.findConversationById).mockResolvedValue(mockRow);
      vi.mocked(conversationRepo.updateConversation).mockResolvedValue(mockRow);

      const result = await conversationService.updateConversation(userId, conversationId, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('soft deletes conversation', async () => {
      const mockRow: conversationRepo.ConversationRow = {
        id: conversationId,
        userId,
        projectId: null,
        title: 'To Delete',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(conversationRepo.findConversationById).mockResolvedValue(mockRow);
      vi.mocked(conversationRepo.softDeleteConversation).mockResolvedValue(mockRow);

      await expect(
        conversationService.deleteConversation(userId, conversationId),
      ).resolves.not.toThrow();

      expect(conversationRepo.softDeleteConversation).toHaveBeenCalledWith(conversationId, userId);
    });
  });
});
