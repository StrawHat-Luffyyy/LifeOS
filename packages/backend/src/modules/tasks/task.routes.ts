import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createTaskSchema,
  updateTaskSchema,
  getTaskSchema,
  listTasksSchema,
  deleteTaskSchema,
  addTaskDependencySchema,
  removeTaskDependencySchema,
} from '@lifeos/shared';
import * as taskController from './task.controller.js';

const router: IRouter = Router();

// All task routes require authentication (FR-AUTH-4)
router.use(authenticate);

router.post(
  '/',
  validate(createTaskSchema),
  (req, res, next) => taskController.create(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listTasksSchema),
  (req, res, next) => taskController.list(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getTaskSchema),
  (req, res, next) => taskController.getById(req as AuthenticatedRequest, res, next),
);

router.patch(
  '/:id',
  validate(updateTaskSchema),
  (req, res, next) => taskController.update(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteTaskSchema),
  (req, res, next) => taskController.remove(req as AuthenticatedRequest, res, next),
);

// Task Dependency Routes (P4-1)
router.post(
  '/:id/dependencies',
  validate(addTaskDependencySchema),
  (req, res, next) => taskController.addDependency(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id/dependencies/:dependsOnTaskId',
  validate(removeTaskDependencySchema),
  (req, res, next) => taskController.removeDependency(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id/dependencies',
  validate(getTaskSchema),
  (req, res, next) => taskController.getDependencies(req as AuthenticatedRequest, res, next),
);

export { router as taskRouter };
