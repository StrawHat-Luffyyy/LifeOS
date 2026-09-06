import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type DocumentDto, type DocumentChunkDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as docService from './document.service.js';

/**
 * POST /api/documents
 */
export async function upload(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new ValidationError('File is required for upload');
    }

    const doc = await docService.uploadDocument(req.user.sub, req.file, {
      title: req.body.title,
      projectId: req.body.projectId,
    });

    const response: ApiResponse<DocumentDto> = { success: true, data: doc };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await docService.listDocuments(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/:id
 */
export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doc = await docService.getDocument(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<DocumentDto> = { success: true, data: doc };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/documents/:id
 */
export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doc = await docService.deleteDocument(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<DocumentDto> = { success: true, data: doc };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/:id/chunks
 */
export async function getChunks(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const chunks = await docService.getDocumentChunks(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<DocumentChunkDto[]> = { success: true, data: chunks };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
