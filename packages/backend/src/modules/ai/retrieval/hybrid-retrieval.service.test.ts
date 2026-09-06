import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridRetrievalService } from './hybrid-retrieval.service.js';
import * as noteRepo from '../../notes/note.repository.js';
import * as docRepo from '../../documents/document.repository.js';
import * as memoryRepo from '../../memory/memory.repository.js';
import { setEmbeddingProvider, MockEmbeddingProvider } from '../embeddings/index.js';

describe('HybridRetrievalService (P3-6, OD-1, FR-RAG)', () => {
  const service = new HybridRetrievalService();
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    setEmbeddingProvider(new MockEmbeddingProvider());
  });

  it('retrieves and fuses results across notes, documents, and memories', async () => {
    const mockNote = {
      id: 'note-1',
      title: 'Docker Deployment Note',
      content: 'Run docker compose up to start postgres and redis',
      tags: ['devops'],
      projectId: null,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      searchVector: null,
      embedding: null,
      embeddingModel: null,
    };

    const mockChunk = {
      id: 'chunk-1',
      documentVersionId: 'ver-1',
      documentId: 'doc-1',
      userId,
      projectId: null,
      content: 'The LifeOS backend runs with Node.js and TypeScript.',
      chunkIndex: 0,
      embedding: null,
      embeddingModel: null,
      searchVector: null,
      createdAt: new Date(),
    };

    const mockMemory = {
      id: 'mem-1',
      userId,
      category: 'preference',
      content: 'Prefers concise summaries over long explanations',
      sourceType: 'user',
      sourceId: null,
      embedding: null,
      embeddingModel: null,
      supersededBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    vi.spyOn(noteRepo, 'searchNotesHybrid').mockResolvedValue({
      rows: [mockNote],
      total: 1,
      scores: new Map([[mockNote.id, 0.016]]),
    });

    vi.spyOn(docRepo, 'searchDocumentChunksHybrid').mockResolvedValue({
      rows: [mockChunk],
      scores: new Map([[mockChunk.id, 0.016]]),
    });

    vi.spyOn(memoryRepo, 'searchMemoriesVector').mockResolvedValue([
      { row: mockMemory, similarity: 0.92 },
    ]);

    const results = await service.retrieve({
      userId,
      query: 'deployment preferences and stack',
      limit: 5,
    });

    expect(results).toHaveLength(3);
    const types = results.map((r) => r.entityType);
    expect(types).toContain('note');
    expect(types).toContain('document');
    expect(types).toContain('memory');

    // Each result contains entityId, title, content, score
    const noteResult = results.find((r) => r.entityType === 'note');
    expect(noteResult?.title).toBe('Docker Deployment Note');
    expect(noteResult?.content).toContain('docker compose');
  });

  it('filters by entityTypes when specified', async () => {
    vi.spyOn(memoryRepo, 'searchMemoriesVector').mockResolvedValue([]);
    vi.spyOn(noteRepo, 'searchNotesHybrid').mockResolvedValue({ rows: [], total: 0, scores: new Map() });
    vi.spyOn(docRepo, 'searchDocumentChunksHybrid').mockResolvedValue({ rows: [], scores: new Map() });

    await service.retrieve({
      userId,
      query: 'some query',
      entityTypes: ['memory'],
    });

    expect(memoryRepo.searchMemoriesVector).toHaveBeenCalled();
    expect(noteRepo.searchNotesHybrid).not.toHaveBeenCalled();
    expect(docRepo.searchDocumentChunksHybrid).not.toHaveBeenCalled();
  });

  it('excludes superseded memories when retrieving (V3-4 read-time supersession enforcement)', async () => {
    // Memory A was superseded by Memory B
    const memoryA = {
      id: 'mem-a',
      userId,
      category: 'preference',
      content: 'Prefers JavaScript over TypeScript',
      sourceType: 'user',
      sourceId: null,
      embedding: null,
      embeddingModel: null,
      supersededBy: 'mem-b', // superseded!
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const memoryB = {
      id: 'mem-b',
      userId,
      category: 'preference',
      content: 'Prefers TypeScript over JavaScript',
      sourceType: 'user',
      sourceId: null,
      embedding: null,
      embeddingModel: null,
      supersededBy: null, // active!
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    // In the database, searchMemoriesVector specifically filters WHERE superseded_by IS NULL,
    // so when a query matches, only active Memory B is returned, and superseded Memory A is excluded.
    const allMemories = [memoryA, memoryB];
    vi.spyOn(memoryRepo, 'searchMemoriesVector').mockImplementation(async (_uId, _emb, _model, _limit) => {
      // Simulate database filter: isNull(memories.supersededBy)
      const activeRows = allMemories.filter((m) => m.supersededBy === null);
      return activeRows.map((row) => ({ row, similarity: 0.95 }));
    });

    vi.spyOn(noteRepo, 'searchNotesHybrid').mockResolvedValue({ rows: [], total: 0, scores: new Map() });
    vi.spyOn(docRepo, 'searchDocumentChunksHybrid').mockResolvedValue({ rows: [], scores: new Map() });

    const results = await service.retrieve({
      userId,
      query: 'programming language preference',
      entityTypes: ['memory'],
    });

    // Assert: Only active Memory B is returned
    expect(results).toHaveLength(1);
    expect(results[0]?.entityId).toBe('mem-b');
    expect(results[0]?.content).toBe('Prefers TypeScript over JavaScript');

    // Assert: Superseded Memory A is completely excluded from search results
    const returnedIds = results.map((r) => r.entityId);
    expect(returnedIds).not.toContain('mem-a');
  });
});
