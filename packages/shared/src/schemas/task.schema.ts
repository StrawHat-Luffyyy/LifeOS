import { z } from 'zod';
import { PRIORITIES, TASK_STATUSES } from '../types/index.js';

// ---------------------------------------------------------------------------
// Task Validation Schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new task. */
export const createTaskSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(500, 'Title must be 500 characters or fewer'),
    description: z.string().trim().max(10_000).nullable().optional(),
    dueDate: z
      .string()
      .datetime({ message: 'Due date must be a valid ISO 8601 date' })
      .nullable()
      .optional(),
    priority: z.enum(PRIORITIES).default('medium'),
    status: z.enum(TASK_STATUSES).default('todo'),
    projectId: z.string().uuid('Invalid project ID').nullable().optional(),
  }),
});

/** Schema for updating an existing task. */
export const updateTaskSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid task ID'),
  }),
  body: z
    .object({
      title: z.string().trim().min(1).max(500).optional(),
      description: z.string().trim().max(10_000).nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      projectId: z.string().uuid().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

/** Schema for getting a single task by ID. */
export const getTaskSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid task ID'),
  }),
});

/** Schema for listing tasks with optional filters and pagination. */
export const listTasksSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    projectId: z.string().uuid().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

/** Schema for deleting a task (soft-delete). */
export const deleteTaskSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid task ID'),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types for use in controllers/services
// ---------------------------------------------------------------------------

export type CreateTaskInput = z.infer<typeof createTaskSchema>['body'];
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>['body'];
export type ListTasksQuery = z.infer<typeof listTasksSchema>['query'];
