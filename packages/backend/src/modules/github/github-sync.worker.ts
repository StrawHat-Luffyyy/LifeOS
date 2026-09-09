import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';
import { syncLinkedRepo, syncAllLinkedRepos } from './github-sync.service.js';
import { githubSyncQueue, type GitHubSyncJobData } from './github-sync.queue.js';

let worker: Worker<GitHubSyncJobData> | null = null;

/**
 * Initializes and starts the BullMQ worker for GitHub repository synchronization.
 * Also schedules the repeatable 15-minute polling job.
 */
export function startGitHubSyncWorker(): Worker<GitHubSyncJobData> {
  if (worker) return worker;

  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  worker = new Worker<GitHubSyncJobData>(
    'github-sync',
    async (job: Job<GitHubSyncJobData>) => {
      if (job.data.type === 'single' && job.data.userId && job.data.projectId) {
        // eslint-disable-next-line no-console
        console.log(`[GitHubSyncWorker] Syncing single project: ${job.data.projectId}`);
        await syncLinkedRepo(job.data.userId, job.data.projectId);
      } else {
        // eslint-disable-next-line no-console
        console.log('[GitHubSyncWorker] Running scheduled sync across all linked repositories');
        await syncAllLinkedRepos();
      }
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[GitHubSyncWorker] Job ${job?.id} failed:`, err);
  });

  // Schedule repeatable background polling (default: every 15 minutes)
  const intervalMinutes = config.GITHUB_SYNC_INTERVAL_MINUTES || 15;
  githubSyncQueue
    .upsertJobScheduler(
      'repeatable_github_sync',
      { pattern: `*/${intervalMinutes} * * * *` },
      {
        name: 'scheduled_sync',
        data: { type: 'all' },
      },
    )
    .catch((err) => {
      console.warn('[GitHubSyncWorker] Could not register repeatable sync job:', err);
    });

  return worker;
}

export async function stopGitHubSyncWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
