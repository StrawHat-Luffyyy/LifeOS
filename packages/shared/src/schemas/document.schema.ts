import { z } from 'zod';
import { DOCUMENT_STATUSES } from '../types/index.js';

export const listDocumentsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid('Invalid project ID').optional(),
    status: z.enum(DOCUMENT_STATUSES).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const getDocumentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid document ID'),
  }),
});

export const deleteDocumentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid document ID'),
  }),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>['query'];
