import { config } from './config/index.js';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 LifeOS backend running on port ${config.PORT} [${config.NODE_ENV}]`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down gracefully...`);

  server.close(async () => {
    await closeDb();
    // eslint-disable-next-line no-console
    console.log('Server closed.');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
