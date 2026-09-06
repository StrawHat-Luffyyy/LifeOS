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
});
