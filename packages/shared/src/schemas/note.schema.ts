import { z } from 'zod';

// ---------------------------------------------------------------------------
// Note Validation Schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new note. */
export const createNoteSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(500, 'Title must be 500 characters or fewer'),
    content: z.string().default(''),
    projectId: z.string().uuid('Invalid project ID').nullable().optional(),
    tags: z.array(z.string().trim()).default([]),
  }),
});

/** Schema for updating an existing note. */
export const updateNoteSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid note ID'),
  }),
  body: z
    .object({
      title: z.string().trim().min(1).max(500).optional(),
      content: z.string().optional(),
      projectId: z.string().uuid('Invalid project ID').nullable().optional(),
      tags: z.array(z.string().trim()).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

/** Schema for getting a single note by ID. */
export const getNoteSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid note ID'),
  }),
});

/** Schema for listing notes with optional filtering and pagination. */
export const listNotesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    projectId: z.string().uuid().optional(),
    tag: z.string().trim().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

/** Schema for searching notes via keyword / full-text search. */
export const searchNotesSchema = z.object({
  query: z.object({
    q: z.string().trim().min(1, 'Search query cannot be empty'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    projectId: z.string().uuid().optional(),
  }),
});

/** Schema for deleting a note (soft-delete). */
export const deleteNoteSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid note ID'),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types for use in controllers/services
// ---------------------------------------------------------------------------

export type CreateNoteInput = z.input<typeof createNoteSchema>['body'];
export type UpdateNoteInput = z.input<typeof updateNoteSchema>['body'];
export type ListNotesQuery = z.infer<typeof listNotesSchema>['query'];
export type SearchNotesQuery = z.infer<typeof searchNotesSchema>['query'];
