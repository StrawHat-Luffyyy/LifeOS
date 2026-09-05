import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { taskRouter } from './modules/tasks/task.routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { noteRouter } from './modules/notes/note.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { conversationRouter } from './modules/ai/conversation.routes.js';

/**
 * Express application factory.
 *
 * Creates and configures the Express app with all middleware and routes.
 * Factored out for testability — tests can create an app without starting the server.
 */
export function createApp(): express.Express {
  const app = express();

  // ---------------------------------------------------------------------------
  // Global middleware
  // ---------------------------------------------------------------------------

  // Security headers
  app.use(helmet());

  // CORS — allow frontend origin
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Response compression
  app.use(compression());

  // HTTP request logging (skip in test to reduce noise)
  if (config.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/notes', noteRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/conversations', conversationRouter);

  // ---------------------------------------------------------------------------
  // Error handling (must be last)
  // ---------------------------------------------------------------------------

  app.use(errorHandler);

  return app;
}
