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

import { uploadDocument, reuploadDocument, processDocumentIngestion } from './document.service.js';
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

  describe('reuploadDocument & version-isolation (V3-3, FR-DOC)', () => {
    it('re-uploads a document creating a distinct version without orphaning or deleting old chunks', async () => {
      const docId = 'doc-1';
      const existingDoc: docRepo.DocumentRow = {
        id: docId,
        userId,
        projectId: null,
        title: 'API Architecture Guide',
        fileName: 'guide-v1.md',
        fileType: 'md',
        fileSize: 120,
        filePath: 'data/uploads/guide-v1.md',
        status: 'ready',
        errorMessage: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
      };

      const existingVersions: docRepo.DocumentVersionRow[] = [
        {
          id: 'ver-1',
          documentId: docId,
          versionNumber: 1,
          filePath: 'data/uploads/guide-v1.md',
          fileSize: 120,
          createdAt: new Date('2026-01-01'),
        },
      ];

      // Simulated database chunk store
      let chunksInDatabase: docRepo.DocumentChunkRow[] = [
        {
          id: 'chunk-v1-1',
          documentVersionId: 'ver-1',
          documentId: docId,
          userId,
          projectId: null,
          content: 'Old version 1 chunk content.',
          chunkIndex: 0,
          embedding: new Array(768).fill(0.01),
          embeddingModel: 'mock-embed-768',
          searchVector: null,
          createdAt: new Date('2026-01-01'),
        },
      ];

      vi.spyOn(docRepo, 'findDocumentByIdOrThrow').mockResolvedValue(existingDoc);
      vi.spyOn(docRepo, 'findDocumentById').mockResolvedValue(existingDoc);
      vi.spyOn(docRepo, 'findDocumentVersions').mockResolvedValue(existingVersions);

      let createdVersion: docRepo.DocumentVersionRow | null = null;
      vi.spyOn(docRepo, 'insertDocumentVersion').mockImplementation(async (data) => {
        createdVersion = {
          id: 'ver-2',
          documentId: data.documentId,
          versionNumber: data.versionNumber ?? 2,
          filePath: data.filePath,
          fileSize: data.fileSize,
          createdAt: new Date(),
        };
        return createdVersion;
      });

      vi.spyOn(docRepo, 'updateDocument').mockImplementation(async (_id, _uId, patch) => {
        return { ...existingDoc, ...patch, updatedAt: new Date() };
      });

      // Hook chunk operations to simulate preserving previous version chunks
      vi.spyOn(docRepo, 'deleteDocumentChunksByVersion').mockImplementation(async (verId) => {
        chunksInDatabase = chunksInDatabase.filter((c) => c.documentVersionId !== verId);
      });

      vi.spyOn(docRepo, 'insertDocumentChunks').mockImplementation(async (newChunks) => {
        const rows: docRepo.DocumentChunkRow[] = newChunks.map((c, i) => ({
          id: `chunk-v2-${i}`,
          documentVersionId: c.documentVersionId,
          documentId: c.documentId,
          userId: c.userId,
          projectId: c.projectId ?? null,
          content: c.content,
          chunkIndex: c.chunkIndex,
          embedding: c.embedding ?? null,
          embeddingModel: c.embeddingModel ?? null,
          searchVector: null,
          createdAt: new Date(),
        }));
        chunksInDatabase.push(...rows);
      });

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      vi.mocked(mockTransaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockTx);
      });

      const fakeFileV2 = {
        originalname: 'guide-v2.md',
        size: 300,
        path: 'data/uploads/guide-v2.md',
      } as Express.Multer.File;

      // 1. Re-upload document (creates version 2)
      const res = await reuploadDocument(userId, docId, fakeFileV2);

      expect(res.id).toBe(docId);
      expect(docRepo.insertDocumentVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: docId,
          versionNumber: 2,
          filePath: 'data/uploads/guide-v2.md',
          fileSize: 300,
        }),
        expect.anything(),
      );

      expect(enqueueDocumentIngestion).toHaveBeenCalledWith({
        documentId: docId,
        versionId: 'ver-2',
        userId,
        filePath: 'data/uploads/guide-v2.md',
        fileType: 'md',
      });

      // 2. Process ingestion for version 2
      await processDocumentIngestion({
        documentId: docId,
        versionId: 'ver-2',
        userId,
        filePath: 'data/uploads/guide-v2.md',
        fileType: 'md',
      });

      // 3. Assertions required by V3-3 acceptance criteria:
      // a) A new DocumentVersion row exists
      expect(createdVersion).not.toBeNull();
      const nonNullVersion = createdVersion as unknown as docRepo.DocumentVersionRow;
      expect(nonNullVersion.id).toBe('ver-2');
      expect(nonNullVersion.versionNumber).toBe(2);

      // b) Old version chunks are still present and still linked to original version (ver-1)
      const v1Chunks = chunksInDatabase.filter((c) => c.documentVersionId === 'ver-1');
      expect(v1Chunks).toHaveLength(1);
      expect(v1Chunks[0]?.content).toBe('Old version 1 chunk content.');
      expect(v1Chunks[0]?.documentVersionId).toBe('ver-1');

      // c) New version chunks are correctly linked to the new version (ver-2)
      const v2Chunks = chunksInDatabase.filter((c) => c.documentVersionId === 'ver-2');
      expect(v2Chunks.length).toBeGreaterThan(0);
      expect(v2Chunks.every((c) => c.documentVersionId === 'ver-2')).toBe(true);
      expect(v2Chunks.every((c) => c.documentId === docId)).toBe(true);
    });
  });
});
