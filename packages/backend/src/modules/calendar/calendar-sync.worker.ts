import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/index.js';
import { syncUserCalendar, syncAllUserCalendars } from './calendar-sync.service.js';
import { calendarSyncQueue, type CalendarSyncJobData } from './calendar-sync.queue.js';

let worker: Worker<CalendarSyncJobData> | null = null;

/**
 * Initializes and starts the BullMQ worker for Google Calendar synchronization.
 * Also schedules the repeatable 15-minute polling job.
 */
export function startCalendarSyncWorker(): Worker<CalendarSyncJobData> {
  if (worker) return worker;

  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  worker = new Worker<CalendarSyncJobData>(
    'calendar-sync',
    async (job: Job<CalendarSyncJobData>) => {
      if (job.data.type === 'single' && job.data.userId) {
        // eslint-disable-next-line no-console
        console.log(`[CalendarSyncWorker] Syncing calendar for user: ${job.data.userId}`);
        await syncUserCalendar(job.data.userId);
      } else {
        // eslint-disable-next-line no-console
        console.log('[CalendarSyncWorker] Running scheduled sync across all user calendars');
        await syncAllUserCalendars();
      }
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[CalendarSyncWorker] Job ${job?.id} failed:`, err);
  });

  // Schedule repeatable background polling (default: every 15 minutes)
  const intervalMinutes = config.CALENDAR_SYNC_INTERVAL_MINUTES || 15;
  calendarSyncQueue
    .upsertJobScheduler(
      'repeatable_calendar_sync',
      { pattern: `*/${intervalMinutes} * * * *` },
      {
        name: 'scheduled_sync',
        data: { type: 'all' },
      },
    )
    .catch((err) => {
      console.warn('[CalendarSyncWorker] Could not register repeatable calendar sync job:', err);
    });

  return worker;
}

export async function stopCalendarSyncWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
