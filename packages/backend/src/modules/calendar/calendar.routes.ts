import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { listCalendarEventsSchema } from '@lifeos/shared';
import * as calendarController from './calendar.controller.js';

const router: IRouter = Router();

// All calendar endpoints require user authentication
router.use(authenticate);

router.get(
  '/events',
  validate(listCalendarEventsSchema),
  (req, res, next) => calendarController.getEvents(req as AuthenticatedRequest, res, next),
);

router.post(
  '/sync',
  (req, res, next) => calendarController.sync(req as AuthenticatedRequest, res, next),
);

export { router as calendarRouter };
