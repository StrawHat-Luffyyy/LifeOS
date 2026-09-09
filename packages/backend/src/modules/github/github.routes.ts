import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  linkRepoSchema,
  unlinkRepoSchema,
  getProjectGitHubSchema,
  syncProjectGitHubSchema,
} from '@lifeos/shared';
import * as githubController from './github.controller.js';

const router: IRouter = Router({ mergeParams: true });

// All GitHub project routes require authentication
router.use(authenticate);

router.post(
  '/link',
  validate(linkRepoSchema),
  (req, res, next) => githubController.link(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/link',
  validate(unlinkRepoSchema),
  (req, res, next) => githubController.unlink(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(getProjectGitHubSchema),
  (req, res, next) => githubController.getData(req as AuthenticatedRequest, res, next),
);

router.post(
  '/sync',
  validate(syncProjectGitHubSchema),
  (req, res, next) => githubController.sync(req as AuthenticatedRequest, res, next),
);

export { router as githubRouter };
