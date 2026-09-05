import { type Response, type NextFunction } from 'express';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as conversationService from './conversation.service.js';
import { streamChatMessage } from './chat.service.js';
import {
  type CreateConversationInput,
  type UpdateConversationInput,
  type ListConversationsQuery,
  type SendMessageInput,
} from '@lifeos/shared';

export async function createConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateConversationInput;
    const conversation = await conversationService.createConversation(req.user.sub, input);
    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

export async function listConversations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListConversationsQuery;
    const response = await conversationService.listConversations(req.user.sub, query);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function getConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const conversationId = req.params['id'] as string;
    const conversation = await conversationService.getConversation(req.user.sub, conversationId);
    res.status(200).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

export async function updateConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const conversationId = req.params['id'] as string;
    const input = req.body as UpdateConversationInput;
    const updated = await conversationService.updateConversation(req.user.sub, conversationId, input);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const conversationId = req.params['id'] as string;
    await conversationService.deleteConversation(req.user.sub, conversationId);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/**
 * SSE Chat Streaming Endpoint (FR-CHAT-2, P2-3).
 * Accepts user message, persists it, and streams back assistant tokens and tool events.
 * Handles client disconnect mid-stream gracefully without corrupting history.
 */
export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const conversationId = req.params['id'] as string;
    const { content } = req.body as SendMessageInput;

    // Verify conversation existence & tenant isolation before opening SSE stream
    await conversationService.getConversation(req.user.sub, conversationId);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortController = new AbortController();

    // Client disconnect handling
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const stream = streamChatMessage(
      req.user.sub,
      conversationId,
      content,
      abortController.signal,
    );

    for await (const event of stream) {
      if (res.writableEnded) break;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    next(err);
  }
}
