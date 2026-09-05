import { Router, type IRouter } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createConversationSchema,
  listConversationsSchema,
  getConversationSchema,
  updateConversationSchema,
  deleteConversationSchema,
  sendMessageSchema,
} from '@lifeos/shared';
import * as controller from './conversation.controller.js';

const router: IRouter = Router();

// All conversation routes require authentication
router.use(authenticate);

router.post(
  '/',
  validate(createConversationSchema),
  (req, res, next) => controller.createConversation(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listConversationsSchema),
  (req, res, next) => controller.listConversations(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getConversationSchema),
  (req, res, next) => controller.getConversation(req as AuthenticatedRequest, res, next),
);

router.patch(
  '/:id',
  validate(updateConversationSchema),
  (req, res, next) => controller.updateConversation(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteConversationSchema),
  (req, res, next) => controller.deleteConversation(req as AuthenticatedRequest, res, next),
);

router.post(
  '/:id/messages',
  validate(sendMessageSchema),
  (req, res, next) => controller.sendMessage(req as AuthenticatedRequest, res, next),
);

export { router as conversationRouter };
