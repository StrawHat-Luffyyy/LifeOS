import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createProjectSchema,
  updateProjectSchema,
  getProjectSchema,
  listProjectsSchema,
  deleteProjectSchema,
  listProjectActivitySchema,
} from '@lifeos/shared';
import * as projectController from './project.controller.js';
import * as activityController from '../activity/activity.controller.js';

const router: IRouter = Router();

// All project routes require authentication
router.use(authenticate);

router.post(
  '/',
  validate(createProjectSchema),
  (req, res, next) => projectController.create(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listProjectsSchema),
  (req, res, next) => projectController.list(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getProjectSchema),
  (req, res, next) => projectController.getById(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id/activity',
  validate(listProjectActivitySchema),
  (req, res, next) => activityController.listByProject(req as AuthenticatedRequest, res, next),
);

router.patch(
  '/:id',
  validate(updateProjectSchema),
  (req, res, next) => projectController.update(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteProjectSchema),
  (req, res, next) => projectController.remove(req as AuthenticatedRequest, res, next),
);

export { router as projectRouter };
