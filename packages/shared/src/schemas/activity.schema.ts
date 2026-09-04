import { z } from 'zod';
import { ENTITY_TYPES } from '../types/index.js';

// ---------------------------------------------------------------------------
// Activity Validation Schemas
// ---------------------------------------------------------------------------

/** Schema for listing activity events with pagination. */
export const listActivitySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    entityType: z.enum(ENTITY_TYPES).optional(),
  }),
});

/** Schema for listing activity events for a specific project. */
export const listProjectActivitySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types for use in controllers/services
// ---------------------------------------------------------------------------

export type ListActivityQuery = z.infer<typeof listActivitySchema>['query'];
export type ListProjectActivityQuery = z.infer<typeof listProjectActivitySchema>['query'];
