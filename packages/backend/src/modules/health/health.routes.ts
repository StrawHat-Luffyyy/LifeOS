import { Router, type IRouter, type Request, type Response } from 'express';
import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';

const router: IRouter = Router();

/**
 * GET /api/health
 *
 * Returns application health status including DB connectivity.
 * No authentication required.
 */
router.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';

  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  const status = dbStatus === 'connected' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    success: true,
    data: {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
      },
    },
  });
});

export { router as healthRouter };
