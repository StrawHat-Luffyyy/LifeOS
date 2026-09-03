import { Router, type IRouter } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import * as authController from './auth.controller.js';

const router: IRouter = Router();

// Rate limiting for auth endpoints (FR-AUTH-5)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts, please try again later' } },
});

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);

export { router as authRouter };
