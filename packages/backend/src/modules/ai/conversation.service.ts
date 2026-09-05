import * as conversationRepo from './conversation.repository.js';
import { getProject } from '../projects/project.service.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type ConversationDto,
  type ConversationWithMessagesDto,
  type MessageDto,
  type ToolCallDto,
  type CreateConversationInput,
  type UpdateConversationInput,
  type ListConversationsQuery,
  type PaginatedResponse,
  type RiskTier,
  type MessageRole,
  type MessageStatus,
} from '@lifeos/shared';

export function toConversationDto(row: conversationRepo.ConversationRow): ConversationDto {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessageDto(row: conversationRepo.MessageRow, toolCalls?: ToolCallDto[]): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    status: row.status as MessageStatus,
    createdAt: row.createdAt.toISOString(),
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export function toToolCallDto(row: conversationRepo.ToolCallRow): ToolCallDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    toolName: row.toolName,
    riskTier: row.riskTier as RiskTier,
    input: row.input,
    output: row.output,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Create a new conversation (FR-CHAT-1).
 * If projectId is provided, verifies that it exists and belongs to the user (A-4).
 */
export async function createConversation(
  userId: string,
  input: CreateConversationInput,
): Promise<ConversationDto> {
  if (input.projectId) {
    // Throws NotFoundError (404) if project does not exist or belongs to another user (A-4)
    await getProject(userId, input.projectId);
  }

  const row = await conversationRepo.insertConversation({
    userId,
    projectId: input.projectId ?? null,
    title: input.title?.trim() || 'New Conversation',
  });

  return toConversationDto(row);
}

/**
 * Get a conversation by ID with its messages and tool calls.
 * Returns 404 NOT_FOUND on cross-user access (FR-CHAT-1 tenant isolation).
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationWithMessagesDto> {
  const row = await conversationRepo.findConversationById(conversationId, userId);
  if (!row) {
    throw new NotFoundError('Conversation not found');
  }

  const [messageRows, toolCallRows] = await Promise.all([
    conversationRepo.listMessagesByConversation(conversationId),
    conversationRepo.listToolCallsByConversation(conversationId),
  ]);

  const toolCallsByMessageId = new Map<string, ToolCallDto[]>();
  const unlinkedToolCalls: ToolCallDto[] = [];

  for (const tc of toolCallRows) {
    const dto = toToolCallDto(tc);
    if (tc.messageId) {
      const existing = toolCallsByMessageId.get(tc.messageId) ?? [];
      existing.push(dto);
      toolCallsByMessageId.set(tc.messageId, existing);
    } else {
      unlinkedToolCalls.push(dto);
    }
  }

  const messages: MessageDto[] = messageRows.map((m) => {
    const associatedTools = toolCallsByMessageId.get(m.id);
    return toMessageDto(m, associatedTools);
  });

  return {
    ...toConversationDto(row),
    messages,
  };
}

/**
 * List conversations with pagination, optionally filtered by projectId.
 */
export async function listConversations(
  userId: string,
  query: ListConversationsQuery,
): Promise<PaginatedResponse<ConversationDto>> {
  const limit = query.limit ?? 20;
  const page = query.page ?? 1;

  if (query.projectId) {
    await getProject(userId, query.projectId);
  }

  const { rows, total } = await conversationRepo.listConversations(userId, {
    ...query,
    limit,
    page,
  });

  return {
    success: true,
    data: rows.map(toConversationDto),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update conversation title.
 */
export async function updateConversation(
  userId: string,
  conversationId: string,
  input: UpdateConversationInput,
): Promise<ConversationDto> {
  const row = await conversationRepo.findConversationById(conversationId, userId);
  if (!row) {
    throw new NotFoundError('Conversation not found');
  }

  const updated = await conversationRepo.updateConversation(conversationId, userId, {
    title: input.title.trim(),
  });

  if (!updated) {
    throw new NotFoundError('Conversation not found');
  }

  return toConversationDto(updated);
}

/**
 * Soft delete conversation.
 */
export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const row = await conversationRepo.findConversationById(conversationId, userId);
  if (!row) {
    throw new NotFoundError('Conversation not found');
  }

  await conversationRepo.softDeleteConversation(conversationId, userId);
}
