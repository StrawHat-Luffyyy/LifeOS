import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockSelect, mockTransaction } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  notes: { id: 'id', userId: 'user_id', deletedAt: 'deleted_at', tags: 'tags', searchVector: 'search_vector' },
  activityEvents: {},
}));

vi.mock('../projects/project.service.js', () => ({
  getProject: vi.fn(),
}));

import { activityEvents } from '../../db/schema/index.js';
import { createNote, searchNotes, deleteNote } from './note.service.js';
import { getProject } from '../projects/project.service.js';
import * as noteRepo from './note.repository.js';

describe('NoteService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNote', () => {
    it('should create a note and return a DTO with correct shape', async () => {
      const mockNote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Meeting Notes',
        content: 'Discussed Q1 roadmap',
        tags: ['meeting', 'roadmap'],
        projectId: null,
        userId,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockNote]),
            }),
          }),
        };
        return callback(tx);
      });

      const result = await createNote(userId, {
        title: 'Meeting Notes',
        content: 'Discussed Q1 roadmap',
        tags: ['meeting', 'roadmap'],
      });

      expect(result).toMatchObject({
        id: mockNote.id,
        title: 'Meeting Notes',
        content: 'Discussed Q1 roadmap',
        tags: ['meeting', 'roadmap'],
        projectId: null,
        userId,
      });
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it('should execute 2 inserts inside transaction (note + activity event)', async () => {
      const mockNote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Architecture Ideas',
        content: 'Modular monolith',
        tags: [],
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let insertCallCount = 0;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation(() => {
            insertCallCount++;
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockNote]),
              }),
            };
          }),
        };
        return callback(tx);
      });

      await createNote(userId, { title: 'Architecture Ideas' });
      expect(insertCallCount).toBe(2);
    });

    it('should validate project ownership when projectId is provided', async () => {
      const projectId = '77777777-7777-7777-7777-777777777777';
      vi.mocked(getProject).mockResolvedValue({
        id: projectId,
        name: 'Project Alpha',
        description: null,
        status: 'active',
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mockNote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Project Note',
        content: '',
        tags: [],
        projectId,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockNote]),
            }),
          }),
        };
        return callback(tx);
      });

      const res = await createNote(userId, {
        title: 'Project Note',
        projectId,
      });

      expect(getProject).toHaveBeenCalledWith(userId, projectId);
      expect(res.projectId).toBe(projectId);
    });

    it('should throw error when projectId does not belong to the user', async () => {
      const foreignProjectId = '88888888-8888-8888-8888-888888888888';
      vi.mocked(getProject).mockRejectedValue(new Error('Project not found'));

      await expect(
        createNote(userId, {
          title: 'Unauthorized project note',
          projectId: foreignProjectId,
        }),
      ).rejects.toThrow('Project not found');
    });

    it('should persist source: "ai" and conversationId in activity event metadata when context is provided', async () => {
      const mockNote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'AI Note',
        content: 'Note generated by AI',
        tags: ['ai-tag'],
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let activityEventValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation((table) => {
            return {
              values: vi.fn().mockImplementation((vals) => {
                if (table === activityEvents || !vals.title) {
                  activityEventValues = vals;
                }
                return {
                  returning: vi.fn().mockResolvedValue([mockNote]),
                };
              }),
            };
          }),
        };
        return callback(tx);
      });

      await createNote(
        userId,
        { title: 'AI Note', content: 'Note generated by AI', tags: ['ai-tag'] },
        { source: 'ai', conversationId: 'conv-note-777' },
      );

      expect(activityEventValues).not.toBeNull();
      expect((activityEventValues as any).metadata).toMatchObject({
        source: 'ai',
        conversationId: 'conv-note-777',
        tags: ['ai-tag'],
      });
      expect((activityEventValues as any).eventType).toBe('NOTE_CREATED');
    });
  });

  describe('searchNotes', () => {
    it('delegates to repository searchNotes', async () => {
      const mockNotes = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Search Result',
          content: 'Found relevant content here',
          tags: ['research'],
          projectId: null,
          searchVector: null,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      vi.spyOn(noteRepo, 'searchNotes').mockResolvedValue({
        rows: mockNotes,
        total: 1,
      });

      const res = await searchNotes(userId, { q: 'relevant', page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0]?.title).toBe('Search Result');
      expect(res.meta.total).toBe(1);
    });
  });

  describe('deleteNote', () => {
    it('should soft delete note and emit NOTE_DELETED event', async () => {
      const mockNote = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Delete Note',
        content: '',
        tags: [],
        projectId: null,
        searchVector: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.spyOn(noteRepo, 'softDeleteNote').mockResolvedValue(mockNote);

      let activityValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals) => {
              activityValues = vals;
              return { returning: vi.fn().mockResolvedValue([]) };
            }),
          }),
        };
        return callback(tx);
      });

      const result = await deleteNote(userId, mockNote.id);
      expect(result.id).toBe(mockNote.id);
      expect(activityValues).toMatchObject({
        eventType: 'NOTE_DELETED',
        entityType: 'note',
        entityId: mockNote.id,
      });
    });
  });
});
