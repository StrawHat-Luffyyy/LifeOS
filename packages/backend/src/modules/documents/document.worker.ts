import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';
import { processDocumentIngestion } from './document.service.js';
import type { DocumentIngestionJobData } from './document-queue.js';

let worker: Worker<DocumentIngestionJobData> | null = null;

export function startDocumentWorker(): Worker<DocumentIngestionJobData> {
  if (worker) return worker;

  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  worker = new Worker<DocumentIngestionJobData>(
    'document-ingestion',
    async (job: Job<DocumentIngestionJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[Worker] Ingesting document job ${job.id} (doc: ${job.data.documentId})`);
      await processDocumentIngestion(job.data);
      // eslint-disable-next-line no-console
      console.log(`[Worker] Successfully completed ingestion for document ${job.data.documentId}`);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  return worker;
}

export async function stopDocumentWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
