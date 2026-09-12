import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';

export interface CalendarSyncJobData {
  userId?: string;
  type?: 'single' | 'all';
}

const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const calendarSyncQueue = new Queue<CalendarSyncJobData>('calendar-sync', {
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

export async function enqueueCalendarSync(data: CalendarSyncJobData): Promise<string | undefined> {
  const job = await calendarSyncQueue.add('sync', data, {
    jobId: data.type === 'all' ? undefined : `cal_sync_${data.userId}_${Date.now()}`,
  });
  return job.id;
}
