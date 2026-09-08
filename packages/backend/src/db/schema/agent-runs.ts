import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentType: varchar('agent_type', { length: 50 }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 30 }).notNull(),
    stepsSummary: jsonb('steps_summary').notNull().default([]),
    output: jsonb('output'),
    metadata: jsonb('metadata').default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('agent_runs_user_id_idx').on(table.userId),
    index('agent_runs_project_id_idx').on(table.projectId),
    index('agent_runs_agent_type_idx').on(table.agentType),
  ],
);
