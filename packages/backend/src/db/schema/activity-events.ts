import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

/**
 * Activity events are append-only (FR-ACT-1). They are never edited or deleted
 * through normal application flows, so there is no `updatedAt` or `deletedAt`.
 */
export const activityEvents = pgTable('activity_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  projectId: uuid('project_id').references(() => projects.id),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
