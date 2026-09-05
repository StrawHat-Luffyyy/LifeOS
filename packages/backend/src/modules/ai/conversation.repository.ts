import { eq, and, isNull, desc, asc, count } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { conversations, messages, toolCalls } from '../../db/schema/index.js';
import { type ListConversationsQuery } from '@lifeos/shared';

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ToolCallRow = typeof toolCalls.$inferSelect;

export async function insertConversation(
  data: {
    userId: string;
    projectId?: string | null;
    title: string;
  },
  tx: Database = db,
): Promise<ConversationRow> {
  const [row] = await tx
    .insert(conversations)
    .values({
      userId: data.userId,
      projectId: data.projectId ?? null,
      title: data.title,
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert conversation');
  }
  return row;
}

export async function findConversationById(
  id: string,
  userId: string,
  tx: Database = db,
): Promise<ConversationRow | undefined> {
  const [row] = await tx
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.userId, userId),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

export async function listConversations(
  userId: string,
  query: ListConversationsQuery,
  tx: Database = db,
): Promise<{ rows: ConversationRow[]; total: number }> {
  const conditions = [eq(conversations.userId, userId), isNull(conversations.deletedAt)];

  if (query.projectId) {
    conditions.push(eq(conversations.projectId, query.projectId));
  }

  const whereClause = and(...conditions);
  const limit = query.limit ?? 20;
  const page = query.page ?? 1;
  const offset = (page - 1) * limit;

  const [countResult] = await tx
    .select({ total: count() })
    .from(conversations)
    .where(whereClause);

  const rows = await tx
    .select()
    .from(conversations)
    .where(whereClause)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  return { rows, total: countResult?.total ?? 0 };
}

export async function updateConversation(
  id: string,
  userId: string,
  data: Partial<{ title: string; updatedAt: Date }>,
  tx: Database = db,
): Promise<ConversationRow | undefined> {
  const [row] = await tx
    .update(conversations)
    .set({
      ...data,
      updatedAt: data.updatedAt ?? new Date(),
    })
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.userId, userId),
        isNull(conversations.deletedAt),
      ),
    )
    .returning();
  return row;
}

export async function softDeleteConversation(
  id: string,
  userId: string,
  tx: Database = db,
): Promise<ConversationRow | undefined> {
  const [row] = await tx
    .update(conversations)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.userId, userId),
        isNull(conversations.deletedAt),
      ),
    )
    .returning();
  return row;
}

export async function insertMessage(
  data: {
    conversationId: string;
    role: string;
    content: string;
    status?: string;
  },
  tx: Database = db,
): Promise<MessageRow> {
  const [row] = await tx
    .insert(messages)
    .values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      status: data.status ?? 'completed',
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert message');
  }
  return row;
}

export async function listMessagesByConversation(
  conversationId: string,
  tx: Database = db,
): Promise<MessageRow[]> {
  return tx
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export async function updateMessage(
  id: string,
  data: Partial<{ content: string; status: string }>,
  tx: Database = db,
): Promise<MessageRow | undefined> {
  const [row] = await tx
    .update(messages)
    .set(data)
    .where(eq(messages.id, id))
    .returning();
  return row;
}

export async function insertToolCall(
  data: {
    conversationId: string;
    messageId?: string | null;
    toolName: string;
    riskTier: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  },
  tx: Database = db,
): Promise<ToolCallRow> {
  const [row] = await tx
    .insert(toolCalls)
    .values({
      conversationId: data.conversationId,
      messageId: data.messageId ?? null,
      toolName: data.toolName,
      riskTier: data.riskTier,
      input: data.input,
      output: data.output,
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert tool call');
  }
  return row;
}

export async function listToolCallsByConversation(
  conversationId: string,
  tx: Database = db,
): Promise<ToolCallRow[]> {
  return tx
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.conversationId, conversationId))
    .orderBy(asc(toolCalls.createdAt));
}
