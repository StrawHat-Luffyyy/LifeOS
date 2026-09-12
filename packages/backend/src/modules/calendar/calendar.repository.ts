import { eq, and, gte, lte, notInArray, asc } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { calendarEvents } from '../../db/schema/index.js';

export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type CalendarEventInsert = typeof calendarEvents.$inferInsert;

/**
 * Lists calendar events for a specific user within a time range, sorted by start time ascending.
 */
export async function listEventsByUser(
  userId: string,
  timeMin?: Date,
  timeMax?: Date,
  tx: Database = db,
): Promise<CalendarEventRow[]> {
  const conditions = [eq(calendarEvents.userId, userId)];

  if (timeMin) {
    conditions.push(gte(calendarEvents.startTime, timeMin));
  }
  if (timeMax) {
    conditions.push(lte(calendarEvents.startTime, timeMax));
  }

  return tx
    .select()
    .from(calendarEvents)
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startTime));
}

/**
 * Upserts a batch of calendar events for a user.
 */
export async function upsertEvents(
  events: CalendarEventInsert[],
  tx: Database = db,
): Promise<{ added: number; updated: number }> {
  if (events.length === 0) {
    return { added: 0, updated: 0 };
  }

  let added = 0;
  let updated = 0;

  for (const event of events) {
    const [existing] = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, event.userId),
          eq(calendarEvents.googleEventId, event.googleEventId),
        ),
      );

    if (existing) {
      await tx
        .update(calendarEvents)
        .set({
          summary: event.summary,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          htmlLink: event.htmlLink,
          lastSyncedAt: new Date(),
        })
        .where(eq(calendarEvents.id, existing.id));
      updated++;
    } else {
      await tx.insert(calendarEvents).values({
        ...event,
        lastSyncedAt: new Date(),
      });
      added++;
    }
  }

  return { added, updated };
}

/**
 * Prunes events belonging to a user within the specified time window that are NOT in activeGoogleEventIds.
 */
export async function pruneEventsInWindow(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  activeGoogleEventIds: string[],
  tx: Database = db,
): Promise<number> {
  const conditions = [
    eq(calendarEvents.userId, userId),
    gte(calendarEvents.startTime, timeMin),
    lte(calendarEvents.startTime, timeMax),
  ];

  if (activeGoogleEventIds.length > 0) {
    conditions.push(notInArray(calendarEvents.googleEventId, activeGoogleEventIds));
  }

  const deleted = await tx
    .delete(calendarEvents)
    .where(and(...conditions))
    .returning({ id: calendarEvents.id });

  return deleted.length;
}

/**
 * Deletes all calendar events for a user (e.g. upon disconnecting integration).
 */
export async function deleteAllForUser(userId: string, tx: Database = db): Promise<number> {
  const deleted = await tx
    .delete(calendarEvents)
    .where(eq(calendarEvents.userId, userId))
    .returning({ id: calendarEvents.id });

  return deleted.length;
}
