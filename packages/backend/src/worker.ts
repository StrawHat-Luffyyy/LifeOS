/* eslint-disable no-console */
import { startDocumentWorker, stopDocumentWorker } from './modules/documents/document.worker.js';
import { closeDb } from './db/index.js';

console.log('LifeOS document ingestion worker starting...');
startDocumentWorker();

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — stopping worker...`);
  await stopDocumentWorker();
  await closeDb();
  console.log('Worker stopped cleanly.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
