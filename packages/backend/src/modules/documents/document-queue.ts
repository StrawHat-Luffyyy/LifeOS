import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';

export interface DocumentIngestionJobData {
  documentId: string;
  versionId: string;
  userId: string;
  filePath: string;
  fileType: 'pdf' | 'txt' | 'md';
}

const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const documentQueue = new Queue<DocumentIngestionJobData>('document-ingestion', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueDocumentIngestion(data: DocumentIngestionJobData): Promise<string | undefined> {
  const job = await documentQueue.add('ingest', data, {
    jobId: `${data.documentId}_v_${data.versionId}`,
  });
  return job.id;
}
