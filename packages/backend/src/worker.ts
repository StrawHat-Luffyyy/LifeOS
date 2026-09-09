/* eslint-disable no-console */
import { startDocumentWorker, stopDocumentWorker } from './modules/documents/document.worker.js';
import { startGitHubSyncWorker, stopGitHubSyncWorker } from './modules/github/github-sync.worker.js';
import { closeDb } from './db/index.js';

console.log('LifeOS background workers starting (document ingestion + GitHub sync)...');
startDocumentWorker();
startGitHubSyncWorker();

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — stopping workers...`);
  await Promise.all([stopDocumentWorker(), stopGitHubSyncWorker()]);
  await closeDb();
  console.log('Workers stopped cleanly.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
