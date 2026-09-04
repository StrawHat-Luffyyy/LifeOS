import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as noteRepo from './note.repository.js';
import { getProject } from '../projects/project.service.js';
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
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput,
): Promise<NoteDto> {
  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const result = await db.transaction(async (tx) => {
    const note = await noteRepo.insertNote(
      {
        title: input.title,
        content: input.content ?? '',
        tags: input.tags ?? [],
        projectId: input.projectId ?? null,
        userId,
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
      metadata: { tags: note.tags },
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
 * Search notes via keyword / full-text search.
 */
export async function searchNotes(
  userId: string,
  query: SearchNotesQuery,
): Promise<PaginatedResponse<NoteDto>> {
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
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<NoteDto> {
  await noteRepo.findNoteByIdOrThrow(noteId, userId);

  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData['title'] = input.title;
    if (input.content !== undefined) updateData['content'] = input.content;
    if (input.tags !== undefined) updateData['tags'] = input.tags;
    if (input.projectId !== undefined) updateData['projectId'] = input.projectId;

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
