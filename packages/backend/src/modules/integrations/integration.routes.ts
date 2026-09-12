import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { connectGitHubSchema } from '@lifeos/shared';
import * as integrationController from './integration.controller.js';

const router: IRouter = Router();

// Public callback for Google OAuth redirect
router.get(
  '/google/callback',
  (req, res, next) => integrationController.googleCallback(req, res, next),
);

// All subsequent integration endpoints require user authentication
router.use(authenticate);

// GitHub endpoints
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

// Google Calendar endpoints
router.get(
  '/google/auth-url',
  (req, res, next) => integrationController.getGoogleAuthUrl(req as AuthenticatedRequest, res, next),
);

router.get(
  '/google',
  (req, res, next) => integrationController.getGoogleConnection(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/google/disconnect',
  (req, res, next) => integrationController.disconnectGoogle(req as AuthenticatedRequest, res, next),
);

export { router as integrationRouter };
