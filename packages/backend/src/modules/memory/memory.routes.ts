import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createMemorySchema,
  updateMemorySchema,
  getMemorySchema,
  listMemoriesSchema,
  deleteMemorySchema,
} from '@lifeos/shared';
import * as memoryController from './memory.controller.js';

const router: IRouter = Router();

// All memory routes require authentication
router.use(authenticate);

router.post(
  '/',
  validate(createMemorySchema),
  (req, res, next) => memoryController.create(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listMemoriesSchema),
  (req, res, next) => memoryController.list(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getMemorySchema),
  (req, res, next) => memoryController.getById(req as AuthenticatedRequest, res, next),
);

router.patch(
  '/:id',
  validate(updateMemorySchema),
  (req, res, next) => memoryController.update(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteMemorySchema),
  (req, res, next) => memoryController.remove(req as AuthenticatedRequest, res, next),
);

export { router as memoryRouter };
