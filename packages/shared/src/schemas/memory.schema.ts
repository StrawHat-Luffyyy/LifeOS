import { z } from 'zod';
import { MEMORY_CATEGORIES, MEMORY_SOURCE_TYPES } from '../types/index.js';

export const createMemorySchema = z.object({
  body: z.object({
    category: z.enum(MEMORY_CATEGORIES),
    content: z
      .string()
      .trim()
      .min(1, 'Memory content cannot be empty')
      .max(5000, 'Memory content too long'),
    sourceType: z.enum(MEMORY_SOURCE_TYPES).default('user'),
    sourceId: z.string().uuid('Invalid source ID').nullable().optional(),
  }),
});

export const updateMemorySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid memory ID'),
  }),
  body: z
    .object({
      content: z.string().trim().min(1).max(5000).optional(),
      category: z.enum(MEMORY_CATEGORIES).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export const getMemorySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid memory ID'),
  }),
});

export const listMemoriesSchema = z.object({
  query: z.object({
    category: z.enum(MEMORY_CATEGORIES).optional(),
    activeOnly: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
    sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const deleteMemorySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid memory ID'),
  }),
});

export type CreateMemoryInput = z.input<typeof createMemorySchema>['body'];
export type UpdateMemoryInput = z.input<typeof updateMemorySchema>['body'];
export type ListMemoriesQuery = z.infer<typeof listMemoriesSchema>['query'];
