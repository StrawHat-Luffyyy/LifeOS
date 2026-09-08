import { pgTable, uuid, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { tasks } from './tasks.js';

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('task_dependencies_task_depends_unique').on(table.taskId, table.dependsOnTaskId),
    index('task_dependencies_task_id_idx').on(table.taskId),
    index('task_dependencies_depends_on_task_id_idx').on(table.dependsOnTaskId),
  ],
);
