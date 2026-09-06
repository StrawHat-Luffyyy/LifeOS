import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as memoryRepo from './memory.repository.js';
import { getEmbeddingProvider } from '../ai/embeddings/index.js';
import {
  type CreateMemoryInput,
  type UpdateMemoryInput,
  type ListMemoriesQuery,
  type MemoryDto,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

/**
 * Create a new memory with automatic embedding generation and conflict resolution (OD-2, FR-MEM).
 * If a semantically similar active memory exists (cosine similarity >= 0.90), the old memory
 * is marked superseded_by = newMemory.id without deletion, preserving provenance.
 */
export async function createMemory(
  userId: string,
  input: CreateMemoryInput,
): Promise<MemoryDto> {
  const provider = getEmbeddingProvider();
  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;

  try {
    embedding = await provider.embed(input.content.trim());
    embeddingModel = provider.modelName;
  } catch (err) {
    console.error('Failed to generate embedding for memory:', err);
  }

  // Conflict resolution check (OD-2)
  let supersededMemoryId: string | null = null;
  if (embedding && embeddingModel) {
    const conflict = await memoryRepo.findSimilarActiveMemory(
      userId,
      embedding,
      embeddingModel,
      0.90,
    );
    if (conflict) {
      supersededMemoryId = conflict.row.id;
    }
  }

  const result = await db.transaction(async (tx) => {
    const memory = await memoryRepo.insertMemory(
      {
        userId,
        category: input.category,
        content: input.content.trim(),
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        embedding: embedding ?? undefined,
        embeddingModel: embeddingModel ?? undefined,
      },
      tx,
    );

    // If an existing active memory is superseded, link it
    if (supersededMemoryId) {
      await memoryRepo.markSuperseded(supersededMemoryId, memory.id, tx);

      await tx.insert(activityEvents).values({
        userId,
        eventType: 'MEMORY_SUPERSEDED' satisfies EventType,
        entityType: 'memory' satisfies EntityType,
        entityId: supersededMemoryId,
        summary: `Memory superseded by new entry: ${memory.content.slice(0, 60)}...`,
        metadata: {
          supersededBy: memory.id,
          category: memory.category,
        },
      });
    }

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'MEMORY_CREATED' satisfies EventType,
      entityType: 'memory' satisfies EntityType,
      entityId: memory.id,
      summary: `Stored memory [${memory.category}]: ${memory.content.slice(0, 60)}...`,
      metadata: {
        category: memory.category,
        sourceType: memory.sourceType,
        sourceId: memory.sourceId,
        supersededMemoryId,
      },
    });

    return memory;
  });

  return toMemoryDto(result);
}

/**
 * Get a single memory by ID scoped to the user.
 */
export async function getMemory(
  userId: string,
  memoryId: string,
): Promise<MemoryDto> {
  const memory = await memoryRepo.findMemoryByIdOrThrow(memoryId, userId);
  return toMemoryDto(memory);
}

/**
 * List memories with category filtering, active filter, and pagination.
 */
export async function listMemories(
  userId: string,
  query: ListMemoriesQuery,
): Promise<PaginatedResponse<MemoryDto>> {
  const { rows, total } = await memoryRepo.listMemories(userId, query);

  return {
    success: true,
    data: rows.map(toMemoryDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Update memory content or category.
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  input: UpdateMemoryInput,
): Promise<MemoryDto> {
  await memoryRepo.findMemoryByIdOrThrow(memoryId, userId);

  const provider = getEmbeddingProvider();
  let embedding: number[] | undefined;
  let embeddingModel: string | undefined;

  if (input.content !== undefined) {
    try {
      embedding = await provider.embed(input.content.trim());
      embeddingModel = provider.modelName;
    } catch (err) {
      console.error('Failed to regenerate embedding for updated memory:', err);
    }
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (input.category !== undefined) updateData['category'] = input.category;
    if (input.content !== undefined) updateData['content'] = input.content.trim();
    if (embedding !== undefined) {
      updateData['embedding'] = embedding;
      updateData['embeddingModel'] = embeddingModel;
    }

    const memory = await memoryRepo.updateMemory(memoryId, userId, updateData, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'MEMORY_UPDATED' satisfies EventType,
      entityType: 'memory' satisfies EntityType,
      entityId: memory.id,
      summary: `Updated memory [${memory.category}]`,
      metadata: { changes: Object.keys(updateData) },
    });

    return memory;
  });

  return toMemoryDto(result);
}

/**
 * Soft-delete a memory (permanently excluded from retrieval, FR-MEM).
 */
export async function deleteMemory(
  userId: string,
  memoryId: string,
): Promise<MemoryDto> {
  const result = await db.transaction(async (tx) => {
    const memory = await memoryRepo.softDeleteMemory(memoryId, userId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'MEMORY_DELETED' satisfies EventType,
      entityType: 'memory' satisfies EntityType,
      entityId: memory.id,
      summary: `Deleted memory [${memory.category}]`,
    });

    return memory;
  });

  return toMemoryDto(result);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toMemoryDto(row: memoryRepo.MemoryRow): MemoryDto {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category as MemoryDto['category'],
    content: row.content,
    sourceType: row.sourceType as MemoryDto['sourceType'],
    sourceId: row.sourceId,
    supersededBy: row.supersededBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
