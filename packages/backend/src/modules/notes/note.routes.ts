import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createNoteSchema,
  updateNoteSchema,
  getNoteSchema,
  listNotesSchema,
  searchNotesSchema,
  deleteNoteSchema,
} from '@lifeos/shared';
import * as noteController from './note.controller.js';

const router: IRouter = Router();

// All note routes require authentication
router.use(authenticate);

router.post(
  '/',
  validate(createNoteSchema),
  (req, res, next) => noteController.create(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listNotesSchema),
  (req, res, next) => noteController.list(req as AuthenticatedRequest, res, next),
);

// /search MUST precede /:id to prevent route shadowing
router.get(
  '/search',
  validate(searchNotesSchema),
  (req, res, next) => noteController.search(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getNoteSchema),
  (req, res, next) => noteController.getById(req as AuthenticatedRequest, res, next),
);

router.patch(
  '/:id',
  validate(updateNoteSchema),
  (req, res, next) => noteController.update(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteNoteSchema),
  (req, res, next) => noteController.remove(req as AuthenticatedRequest, res, next),
);

export { router as noteRouter };
