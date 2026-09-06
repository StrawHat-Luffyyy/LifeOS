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
  documents: { id: 'id', userId: 'user_id', deletedAt: 'deleted_at', status: 'status' },
  documentVersions: { id: 'id', documentId: 'document_id' },
  documentChunks: { id: 'id', documentVersionId: 'document_version_id' },
  activityEvents: {},
}));

vi.mock('./document-queue.js', () => ({
  enqueueDocumentIngestion: vi.fn().mockResolvedValue('job-123'),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('LifeOS Knowledge Retrieval.\n\nUnified RAG combines notes, documents, and memories.'),
  },
}));

import { uploadDocument, processDocumentIngestion } from './document.service.js';
import * as docRepo from './document.repository.js';
import { enqueueDocumentIngestion } from './document-queue.js';
import { setEmbeddingProvider, MockEmbeddingProvider } from '../ai/embeddings/index.js';

describe('Document Service (P3-5, FR-DOC)', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    setEmbeddingProvider(new MockEmbeddingProvider());
  });

  describe('uploadDocument', () => {
    it('creates document, version, and enqueues job', async () => {
      const mockDoc: docRepo.DocumentRow = {
        id: 'doc-1',
        userId,
        projectId: null,
        title: 'Project Roadmap',
        fileName: 'roadmap.md',
        fileType: 'md',
        fileSize: 500,
        filePath: 'data/uploads/roadmap.md',
        status: 'queued',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockVersion: docRepo.DocumentVersionRow = {
        id: 'ver-1',
        documentId: 'doc-1',
        versionNumber: 1,
        filePath: 'data/uploads/roadmap.md',
        fileSize: 500,
        createdAt: new Date(),
      };

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      vi.spyOn(docRepo, 'insertDocument').mockResolvedValue(mockDoc);
      vi.spyOn(docRepo, 'insertDocumentVersion').mockResolvedValue(mockVersion);

      const fakeFile = {
        originalname: 'roadmap.md',
        size: 500,
        path: 'data/uploads/roadmap.md',
      } as Express.Multer.File;

      const result = await uploadDocument(userId, fakeFile, { title: 'Project Roadmap' });

      expect(result.id).toBe('doc-1');
      expect(result.status).toBe('queued');
      expect(docRepo.insertDocument).toHaveBeenCalled();
      expect(docRepo.insertDocumentVersion).toHaveBeenCalled();
      expect(enqueueDocumentIngestion).toHaveBeenCalledWith({
        documentId: 'doc-1',
        versionId: 'ver-1',
        userId,
        filePath: 'data/uploads/roadmap.md',
        fileType: 'md',
      });
    });
  });

  describe('processDocumentIngestion', () => {
    it('processes document, embeds chunks, and sets status to ready', async () => {
      vi.spyOn(docRepo, 'updateDocumentStatus').mockResolvedValue();
      vi.spyOn(docRepo, 'deleteDocumentChunksByVersion').mockResolvedValue();
      vi.spyOn(docRepo, 'insertDocumentChunks').mockResolvedValue();
      vi.spyOn(docRepo, 'findDocumentById').mockResolvedValue({
        id: 'doc-1',
        userId,
        projectId: null,
        title: 'Project Roadmap',
        fileName: 'roadmap.md',
        fileType: 'md',
        fileSize: 500,
        filePath: 'data/uploads/roadmap.md',
        status: 'processing',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      await processDocumentIngestion({
        documentId: 'doc-1',
        versionId: 'ver-1',
        userId,
        filePath: 'data/uploads/roadmap.md',
        fileType: 'md',
      });

      expect(docRepo.updateDocumentStatus).toHaveBeenCalledWith('doc-1', 'processing');
      expect(docRepo.insertDocumentChunks).toHaveBeenCalled();
      expect(docRepo.updateDocumentStatus).toHaveBeenCalledWith('doc-1', 'ready', null, mockTx);
    });
  });
});
