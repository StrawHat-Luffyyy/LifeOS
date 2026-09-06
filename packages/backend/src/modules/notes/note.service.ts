import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as noteRepo from './note.repository.js';
import { getProject } from '../projects/project.service.js';
import { getEmbeddingProvider } from '../ai/embeddings/index.js';
import {
  type CreateNoteInput,
  type UpdateNoteInput,
  type ListNotesQuery,
  type SearchNotesQuery,
  type NoteDto,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Service Layer
// ---------------------------------------------------------------------------

/**
 * Create a note and log an activity event in the same transaction.
 * Synchronously generates an embedding for hybrid retrieval (P3-3, FR-NOTE-3).
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput,
  context?: { source?: string; conversationId?: string },
): Promise<NoteDto> {
  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const provider = getEmbeddingProvider();
  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;

  try {
    const textToEmbed = `${input.title}\n${input.content ?? ''}`.trim();
    if (textToEmbed) {
      embedding = await provider.embed(textToEmbed);
      embeddingModel = provider.modelName;
    }
  } catch (err) {
    // Log error but don't fail note creation if embedding provider is degraded
    console.error('Failed to generate embedding for new note:', err);
  }

  const result = await db.transaction(async (tx) => {
    const note = await noteRepo.insertNote(
      {
        title: input.title,
        content: input.content ?? '',
        tags: input.tags ?? [],
        projectId: input.projectId ?? null,
        userId,
        embedding: embedding ?? undefined,
        embeddingModel: embeddingModel ?? undefined,
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'NOTE_CREATED' satisfies EventType,
      entityType: 'note' satisfies EntityType,
      entityId: note.id,
      projectId: note.projectId,
      summary: `Created note: ${note.title}`,
      metadata: {
        tags: note.tags,
        ...(context?.source ? { source: context.source } : {}),
        ...(context?.conversationId ? { conversationId: context.conversationId } : {}),
      },
    });

    return note;
  });

  return toNoteDto(result);
}

/**
 * Get a single note by ID, scoped to the user.
 */
export async function getNote(
  userId: string,
  noteId: string,
): Promise<NoteDto> {
  const note = await noteRepo.findNoteByIdOrThrow(noteId, userId);
  return toNoteDto(note);
}

/**
 * List notes with optional filtering, sorting, and pagination.
 */
export async function listNotes(
  userId: string,
  query: ListNotesQuery,
): Promise<PaginatedResponse<NoteDto>> {
  const { rows, total } = await noteRepo.listNotes(userId, query);

  return {
    success: true,
    data: rows.map(toNoteDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Search notes via keyword, semantic, or hybrid search (P3-3, FR-NOTE-3).
 */
export async function searchNotes(
  userId: string,
  query: SearchNotesQuery,
): Promise<PaginatedResponse<NoteDto>> {
  const mode = query.mode;

  if (mode === 'hybrid') {
    const provider = getEmbeddingProvider();
    const queryEmbedding = await provider.embed(query.q);
    const { rows, total } = await noteRepo.searchNotesHybrid(
      userId,
      query.q,
      queryEmbedding,
      provider.modelName,
      {
        page: query.page,
        limit: query.limit,
        projectId: query.projectId,
      },
    );

    return {
      success: true,
      data: rows.map(toNoteDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  if (mode === 'semantic') {
    const provider = getEmbeddingProvider();
    const queryEmbedding = await provider.embed(query.q);
    const results = await noteRepo.searchNotesVector(
      userId,
      queryEmbedding,
      provider.modelName,
      query.limit,
      query.projectId,
    );
    return {
      success: true,
      data: results.map((r) => toNoteDto(r.row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: results.length,
        totalPages: 1,
      },
    };
  }

  // Default / keyword search
  const { rows, total } = await noteRepo.searchNotes(userId, query);
  return {
    success: true,
    data: rows.map(toNoteDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Update a note and log an activity event in the same transaction.
 * Synchronously regenerates embedding if title or content changes.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<NoteDto> {
  const existing = await noteRepo.findNoteByIdOrThrow(noteId, userId);

  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const provider = getEmbeddingProvider();
  let embedding: number[] | undefined;
  let embeddingModel: string | undefined;

  if (input.title !== undefined || input.content !== undefined) {
    const newTitle = input.title ?? existing.title;
    const newContent = input.content ?? existing.content;
    const textToEmbed = `${newTitle}\n${newContent}`.trim();
    if (textToEmbed) {
      try {
        embedding = await provider.embed(textToEmbed);
        embeddingModel = provider.modelName;
      } catch (err) {
        console.error('Failed to regenerate embedding for updated note:', err);
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData['title'] = input.title;
    if (input.content !== undefined) updateData['content'] = input.content;
    if (input.tags !== undefined) updateData['tags'] = input.tags;
    if (input.projectId !== undefined) updateData['projectId'] = input.projectId;
    if (embedding !== undefined) {
      updateData['embedding'] = embedding;
      updateData['embeddingModel'] = embeddingModel;
    }

    const note = await noteRepo.updateNote(noteId, userId, updateData, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'NOTE_UPDATED' satisfies EventType,
      entityType: 'note' satisfies EntityType,
      entityId: note.id,
      projectId: note.projectId,
      summary: `Updated note: ${note.title}`,
      metadata: { changes: Object.keys(updateData) },
    });

    return note;
  });

  return toNoteDto(result);
}

/**
 * Soft-delete a note and log an activity event.
 */
export async function deleteNote(
  userId: string,
  noteId: string,
): Promise<NoteDto> {
  const result = await db.transaction(async (tx) => {
    const note = await noteRepo.softDeleteNote(noteId, userId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'NOTE_DELETED' satisfies EventType,
      entityType: 'note' satisfies EntityType,
      entityId: note.id,
      projectId: note.projectId,
      summary: `Deleted note: ${note.title}`,
    });

    return note;
  });

  return toNoteDto(result);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toNoteDto(row: {
  id: string;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}): NoteDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    projectId: row.projectId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
