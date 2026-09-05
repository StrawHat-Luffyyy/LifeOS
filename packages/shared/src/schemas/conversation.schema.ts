import { z } from 'zod';

// ---------------------------------------------------------------------------
// Conversation Validation Schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new conversation. */
export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(255).optional(),
    projectId: z.string().uuid('Invalid project ID').nullable().optional(),
  }),
});

/** Schema for getting a single conversation by ID. */
export const getConversationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
});

/** Schema for updating a conversation's title. */
export const updateConversationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
  body: z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(255),
  }),
});

/** Schema for deleting a conversation. */
export const deleteConversationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
});

/** Schema for listing conversations. */
export const listConversationsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid('Invalid project ID').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

/** Schema for sending a message in a conversation. */
export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Message content cannot be empty').max(10000),
  }),
});
