import { db } from '../../db/index.js';
import { activityEvents, integrations } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { googleCalendarClient } from '../../lib/google-calendar-client.js';
import { getValidAccessToken } from '../integrations/google-oauth.service.js';
import * as calendarRepo from './calendar.repository.js';
import {
  type CalendarEventDto,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

function toCalendarEventDto(row: calendarRepo.CalendarEventRow): CalendarEventDto {
  return {
    id: row.id,
    userId: row.userId,
    googleEventId: row.googleEventId,
    summary: row.summary,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    location: row.location ?? null,
    htmlLink: row.htmlLink ?? null,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
  };
}

export interface SyncCalendarResult {
  added: number;
  updated: number;
  pruned: number;
  total: number;
}

/**
 * Synchronizes the primary Google Calendar for a user for a rolling 14-day window.
 * Fetches events, upserts changes, prunes events outside the active set within the window,
 * and emits a single summary activity event with source: 'calendar_sync'.
 */
export async function syncUserCalendar(userId: string): Promise<SyncCalendarResult> {
  // 1. Calculate rolling 14-day window starting from midnight today
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const timeMax = new Date(timeMin.getTime() + 14 * 24 * 60 * 60 * 1000);

  // 2. Retrieve valid access token (refreshes automatically if expired)
  const accessToken = await getValidAccessToken(userId);

  // 3. Fetch events from Google Calendar API
  const googleEvents = await googleCalendarClient.listEvents(
    accessToken,
    timeMin.toISOString(),
    timeMax.toISOString(),
  );

  const activeGoogleEventIds = googleEvents.map((e) => e.id);

  // 4. Upsert and prune within transaction
  const result = await db.transaction(async (tx) => {
    // A. Upsert returned events
    const insertPayload: calendarRepo.CalendarEventInsert[] = googleEvents.map((e) => ({
      userId,
      googleEventId: e.id,
      summary: e.summary,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      location: e.location || null,
      htmlLink: e.htmlLink || null,
    }));

    const { added, updated } = await calendarRepo.upsertEvents(insertPayload, tx);

    // B. Prune events in the 14-day window that are no longer present in Google Calendar
    const pruned = await calendarRepo.pruneEventsInWindow(
      userId,
      timeMin,
      timeMax,
      activeGoogleEventIds,
      tx,
    );

    // C. Log single summary activity event
    await tx.insert(activityEvents).values({
      userId,
      eventType: 'CALENDAR_SYNC_COMPLETED' satisfies EventType,
      entityType: 'calendar_event' satisfies EntityType,
      entityId: userId,
      projectId: null,
      summary: `Synced calendar: ${added} added, ${updated} updated, ${pruned} pruned`,
      metadata: {
        source: 'calendar_sync',
        added,
        updated,
        pruned,
        total: googleEvents.length,
      },
    });

    return {
      added,
      updated,
      pruned,
      total: googleEvents.length,
    };
  });

  return result;
}

/**
 * Synchronizes all users who have an active Google Calendar integration connected.
 */
export async function syncAllUserCalendars(): Promise<void> {
  const rows = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(eq(integrations.provider, 'google'));

  for (const { userId } of rows) {
    try {
      await syncUserCalendar(userId);
    } catch (err) {
      console.error(`[CalendarSyncService] Error syncing calendar for user ${userId}:`, err);
    }
  }
}

/**
 * Returns cached calendar events for a user, sorted chronologically.
 */
export async function listUserCalendarEvents(
  userId: string,
  timeMin?: string,
  timeMax?: string,
): Promise<CalendarEventDto[]> {
  const minDate = timeMin ? new Date(timeMin) : undefined;
  const maxDate = timeMax ? new Date(timeMax) : undefined;

  const rows = await calendarRepo.listEventsByUser(userId, minDate, maxDate);
  return rows.map(toCalendarEventDto);
}
