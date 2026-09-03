import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  status: varchar('status', { length: 20 }).notNull().default('todo'),
  projectId: uuid('project_id').references(() => projects.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
