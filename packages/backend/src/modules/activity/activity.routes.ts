import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { listActivitySchema } from '@lifeos/shared';
import * as activityController from './activity.controller.js';

const router: IRouter = Router();

// All activity routes require authentication
router.use(authenticate);

router.get(
  '/',
  validate(listActivitySchema),
  (req, res, next) => activityController.list(req as AuthenticatedRequest, res, next),
);

export { router as activityRouter };
