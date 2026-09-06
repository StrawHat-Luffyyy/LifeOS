import { getEmbeddingProvider } from '../embeddings/index.js';
import * as noteRepo from '../../notes/note.repository.js';
import * as docRepo from '../../documents/document.repository.js';
import * as memoryRepo from '../../memory/memory.repository.js';
import {
  type RetrievalResultDto,
  type RetrievalEntityType,
} from '@lifeos/shared';

export interface RetrieveParams {
  userId: string;
  query: string;
  limit?: number;
  projectId?: string;
  entityTypes?: RetrievalEntityType[];
}

export class HybridRetrievalService {
  /**
   * Unified hybrid retrieval querying Notes, Document Chunks, and Memories (P3-6, OD-1, FR-RAG).
   * Combines keyword FTS and vector cosine similarity across domains using Reciprocal Rank Fusion.
   */
  async retrieve(params: RetrieveParams): Promise<RetrievalResultDto[]> {
    const { userId, query, projectId } = params;
    const limit = params.limit ?? 5;
    const entityTypes = params.entityTypes ?? ['note', 'document', 'memory'];

    const provider = getEmbeddingProvider();
    const activeModel = provider.modelName;

    // Generate query embedding vector
    const queryEmbedding = await provider.embed(query);

    const candidates: RetrievalResultDto[] = [];
    const k = 60;

    // 1. Notes (Hybrid FTS + Vector)
    if (entityTypes.includes('note')) {
      const { rows: noteRows } = await noteRepo.searchNotesHybrid(
        userId,
        query,
        queryEmbedding,
        activeModel,
        { limit: limit * 2, projectId },
      );

      noteRows.forEach((note, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        candidates.push({
          entityType: 'note',
          entityId: note.id,
          title: note.title,
          content: note.content,
          score: rrfScore,
          metadata: {
            tags: note.tags,
            projectId: note.projectId,
          },
        });
      });
    }

    // 2. Document Chunks (Hybrid FTS + Vector)
    if (entityTypes.includes('document')) {
      const { rows: chunkRows } = await docRepo.searchDocumentChunksHybrid(
        userId,
        query,
        queryEmbedding,
        activeModel,
        { limit: limit * 2, projectId },
      );

      chunkRows.forEach((chunk, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        candidates.push({
          entityType: 'document',
          entityId: chunk.documentId,
          title: `Document excerpt (chunk ${chunk.chunkIndex + 1})`,
          content: chunk.content,
          score: rrfScore,
          metadata: {
            chunkId: chunk.id,
            chunkIndex: chunk.chunkIndex,
            projectId: chunk.projectId,
          },
        });
      });
    }

    // 3. Memories (Vector Similarity)
    if (entityTypes.includes('memory')) {
      const memoryRows = await memoryRepo.searchMemoriesVector(
        userId,
        queryEmbedding,
        activeModel,
        limit * 2,
      );

      memoryRows.forEach(({ row: memory }, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        candidates.push({
          entityType: 'memory',
          entityId: memory.id,
          title: `Memory [${memory.category}]`,
          content: memory.content,
          score: rrfScore,
          metadata: {
            category: memory.category,
            sourceType: memory.sourceType,
          },
        });
      });
    }

    // Sort all retrieved candidates across domains by fused RRF score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, limit);
  }
}

export const hybridRetrievalService = new HybridRetrievalService();
