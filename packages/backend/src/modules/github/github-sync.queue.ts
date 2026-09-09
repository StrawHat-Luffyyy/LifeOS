import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';

export interface GitHubSyncJobData {
  projectId?: string;
  userId?: string;
  type?: 'single' | 'all';
}

const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const githubSyncQueue = new Queue<GitHubSyncJobData>('github-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueGitHubSync(data: GitHubSyncJobData): Promise<string | undefined> {
  const job = await githubSyncQueue.add('sync', data, {
    jobId: data.type === 'all' ? undefined : `sync_${data.projectId}_${Date.now()}`,
  });
  return job.id;
}
