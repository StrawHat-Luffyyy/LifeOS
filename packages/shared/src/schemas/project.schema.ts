import { z } from 'zod';
import { PROJECT_STATUSES } from '../types/index.js';

// ---------------------------------------------------------------------------
// Project Validation Schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new project. */
export const createProjectSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(200, 'Name must be 200 characters or fewer'),
    description: z.string().trim().max(10_000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).default('active'),
  }),
});

/** Schema for updating an existing project. */
export const updateProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(10_000).nullable().optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

/** Schema for getting a single project by ID. */
export const getProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
});

/** Schema for listing projects with optional filters and pagination. */
export const listProjectsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(PROJECT_STATUSES).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

/** Schema for deleting a project (soft-delete). */
export const deleteProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types for use in controllers/services
// ---------------------------------------------------------------------------

export type CreateProjectInput = z.input<typeof createProjectSchema>['body'];
export type UpdateProjectInput = z.input<typeof updateProjectSchema>['body'];
export type ListProjectsQuery = z.infer<typeof listProjectsSchema>['query'];
