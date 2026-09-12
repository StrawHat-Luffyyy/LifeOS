import { pgTable, uuid, varchar, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    googleEventId: varchar('google_event_id', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    location: text('location'),
    htmlLink: text('html_link'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('calendar_events_user_google_event_unique').on(table.userId, table.googleEventId),
    index('calendar_events_user_start_time_idx').on(table.userId, table.startTime),
  ],
);
