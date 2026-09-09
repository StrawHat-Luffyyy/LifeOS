import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { connectGitHubSchema } from '@lifeos/shared';
import * as integrationController from './integration.controller.js';

const router: IRouter = Router();

// All integration endpoints require user authentication
router.use(authenticate);

router.post(
  '/github/connect',
  validate(connectGitHubSchema),
  (req, res, next) => integrationController.connect(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/github/disconnect',
  (req, res, next) => integrationController.disconnect(req as AuthenticatedRequest, res, next),
);

router.get(
  '/github',
  (req, res, next) => integrationController.getConnection(req as AuthenticatedRequest, res, next),
);

export { router as integrationRouter };
