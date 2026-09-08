import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../../../middleware/auth.js';
import { validate } from '../../../../middleware/validate.js';
import {
  runPlannerSchema,
  acceptPlannerRecommendationSchema,
  rejectPlannerRecommendationSchema,
} from '@lifeos/shared';
import * as plannerController from './planner.controller.js';

const router: IRouter = Router();

router.use(authenticate);

router.post(
  '/',
  validate(runPlannerSchema),
  (req, res, next) => plannerController.run(req as AuthenticatedRequest, res, next),
);

router.post(
  '/recommendations/:taskId/accept',
  validate(acceptPlannerRecommendationSchema),
  (req, res, next) => plannerController.accept(req as AuthenticatedRequest, res, next),
);

router.post(
  '/recommendations/:taskId/reject',
  validate(rejectPlannerRecommendationSchema),
  (req, res, next) => plannerController.reject(req as AuthenticatedRequest, res, next),
);

export { router as plannerRouter };
