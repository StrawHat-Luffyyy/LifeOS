import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type MemoryDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as memoryService from './memory.service.js';

/**
 * POST /api/memories
 */
export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const memory = await memoryService.createMemory(req.user.sub, req.body);
    const response: ApiResponse<MemoryDto> = { success: true, data: memory };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/memories
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await memoryService.listMemories(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/memories/:id
 */
export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const memory = await memoryService.getMemory(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<MemoryDto> = { success: true, data: memory };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/memories/:id
 */
export async function update(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const memory = await memoryService.updateMemory(
      req.user.sub,
      req.params['id'] as string,
      req.body,
    );
    const response: ApiResponse<MemoryDto> = { success: true, data: memory };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/memories/:id
 */
export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const memory = await memoryService.deleteMemory(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<MemoryDto> = { success: true, data: memory };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
