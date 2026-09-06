import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockSelect, mockTransaction, mockUpdate } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  memories: {
    id: 'id',
    userId: 'user_id',
    category: 'category',
    content: 'content',
    deletedAt: 'deleted_at',
    supersededBy: 'superseded_by',
    embedding: 'embedding',
    embeddingModel: 'embedding_model',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  activityEvents: {},
}));

import { createMemory, getMemory, listMemories, deleteMemory } from './memory.service.js';
import * as memoryRepo from './memory.repository.js';
import { setEmbeddingProvider, MockEmbeddingProvider } from '../ai/embeddings/index.js';
import { NotFoundError } from '../../lib/errors.js';

describe('MemoryService (OD-2, FR-MEM)', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    setEmbeddingProvider(new MockEmbeddingProvider());
  });

  describe('createMemory', () => {
    it('creates a new memory without conflicts', async () => {
      vi.spyOn(memoryRepo, 'findSimilarActiveMemory').mockResolvedValue(undefined);

      const insertedRow: memoryRepo.MemoryRow = {
        id: '11111111-1111-1111-1111-111111111111',
        userId,
        category: 'preference',
        content: 'Prefers TypeScript over Python',
        sourceType: 'user',
        sourceId: null,
        embedding: new Array(768).fill(0.01),
        embeddingModel: 'mock-embed-768',
        supersededBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      vi.spyOn(memoryRepo, 'insertMemory').mockResolvedValue(insertedRow);

      const result = await createMemory(userId, {
        category: 'preference',
        content: 'Prefers TypeScript over Python',
        sourceType: 'user',
      });

      expect(result.id).toBe(insertedRow.id);
      expect(result.category).toBe('preference');
      expect(result.content).toBe('Prefers TypeScript over Python');
      expect(result.supersededBy).toBeNull();
      expect(memoryRepo.insertMemory).toHaveBeenCalled();
    });

    it('handles conflict resolution by marking older similar memory as superseded (OD-2)', async () => {
      const existingConflict: { row: memoryRepo.MemoryRow; similarity: number } = {
        row: {
          id: 'old-memory-id',
          userId,
          category: 'preference',
          content: 'Prefers JavaScript',
          sourceType: 'user',
          sourceId: null,
          embedding: new Array(768).fill(0.01),
          embeddingModel: 'mock-embed-768',
          supersededBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        similarity: 0.94,
      };

      vi.spyOn(memoryRepo, 'findSimilarActiveMemory').mockResolvedValue(existingConflict);
      vi.spyOn(memoryRepo, 'markSuperseded').mockResolvedValue();

      const newRow: memoryRepo.MemoryRow = {
        id: 'new-memory-id',
        userId,
        category: 'preference',
        content: 'Prefers TypeScript strongly now',
        sourceType: 'user',
        sourceId: null,
        embedding: new Array(768).fill(0.01),
        embeddingModel: 'mock-embed-768',
        supersededBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      vi.spyOn(memoryRepo, 'insertMemory').mockResolvedValue(newRow);

      const result = await createMemory(userId, {
        category: 'preference',
        content: 'Prefers TypeScript strongly now',
        sourceType: 'user',
      });

      expect(result.id).toBe('new-memory-id');
      // OD-2: ensure old memory was marked superseded
      expect(memoryRepo.markSuperseded).toHaveBeenCalledWith('old-memory-id', 'new-memory-id', mockTx);
    });
  });

  describe('getMemory', () => {
    it('returns memory when found', async () => {
      const mockRow: memoryRepo.MemoryRow = {
        id: 'mem-1',
        userId,
        category: 'goal',
        content: 'Launch Phase 3',
        sourceType: 'chat',
        sourceId: null,
        embedding: null,
        embeddingModel: null,
        supersededBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(memoryRepo, 'findMemoryByIdOrThrow').mockResolvedValue(mockRow);

      const res = await getMemory(userId, 'mem-1');
      expect(res.id).toBe('mem-1');
      expect(res.content).toBe('Launch Phase 3');
    });

    it('throws NotFoundError when memory not found (404 isolation)', async () => {
      vi.spyOn(memoryRepo, 'findMemoryByIdOrThrow').mockRejectedValue(new NotFoundError('Memory', 'missing-id'));
      await expect(getMemory(userId, 'missing-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listMemories', () => {
    it('returns paginated memories', async () => {
      const mockRow: memoryRepo.MemoryRow = {
        id: 'mem-1',
        userId,
        category: 'fact',
        content: 'Postgres 17 used',
        sourceType: 'user',
        sourceId: null,
        embedding: null,
        embeddingModel: null,
        supersededBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(memoryRepo, 'listMemories').mockResolvedValue({
        rows: [mockRow],
        total: 1,
      });

      const res = await listMemories(userId, { page: 1, limit: 20, activeOnly: true, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('deleteMemory', () => {
    it('soft deletes memory', async () => {
      const mockRow: memoryRepo.MemoryRow = {
        id: 'mem-1',
        userId,
        category: 'fact',
        content: 'Fact to delete',
        sourceType: 'user',
        sourceId: null,
        embedding: null,
        embeddingModel: null,
        supersededBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      vi.spyOn(memoryRepo, 'softDeleteMemory').mockResolvedValue(mockRow);

      const res = await deleteMemory(userId, 'mem-1');
      expect(res.id).toBe('mem-1');
      expect(memoryRepo.softDeleteMemory).toHaveBeenCalledWith('mem-1', userId, mockTx);
    });
  });
});
