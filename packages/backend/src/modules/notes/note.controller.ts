import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type NoteDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as noteService from './note.service.js';

/**
 * POST /api/notes
 */
export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const note = await noteService.createNote(req.user.sub, req.body);
    const response: ApiResponse<NoteDto> = { success: true, data: note };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notes
 */
export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await noteService.listNotes(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notes/search
 */
export async function search(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await noteService.searchNotes(req.user.sub, req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notes/:id
 */
export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const note = await noteService.getNote(req.user.sub, req.params['id'] as string);
    const response: ApiResponse<NoteDto> = { success: true, data: note };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notes/:id
 */
export async function update(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const note = await noteService.updateNote(
      req.user.sub,
      req.params['id'] as string,
      req.body,
    );
    const response: ApiResponse<NoteDto> = { success: true, data: note };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notes/:id
 */
export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await noteService.deleteNote(req.user.sub, req.params['id'] as string);
    res.status(200).json({ success: true, data: { message: 'Note deleted' } });
  } catch (err) {
    next(err);
  }
}
