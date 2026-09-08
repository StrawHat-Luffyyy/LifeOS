import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../../../middleware/auth.js';
import { validate } from '../../../../middleware/validate.js';
import { listAgentRunsSchema, getAgentRunSchema } from '@lifeos/shared';
import * as agentRunController from './agent-run.controller.js';

const router: IRouter = Router();

router.use(authenticate);

router.get(
  '/',
  validate(listAgentRunsSchema),
  (req, res, next) => agentRunController.list(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getAgentRunSchema),
  (req, res, next) => agentRunController.getById(req as AuthenticatedRequest, res, next),
);

export { router as agentRunRouter };
