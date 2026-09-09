import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';

export const projectGithubLinks = pgTable(
  'project_github_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    repoOwner: varchar('repo_owner', { length: 100 }).notNull(),
    repoName: varchar('repo_name', { length: 100 }).notNull(),
    repoUrl: text('repo_url').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('project_github_links_project_id_unique').on(table.projectId),
    index('project_github_links_user_id_idx').on(table.userId),
  ],
);

export const githubIssues = pgTable(
  'github_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    state: varchar('state', { length: 50 }).notNull(),
    url: text('url').notNull(),
    labels: jsonb('labels').$type<string[]>().default([]),
    author: varchar('author', { length: 100 }).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('github_issues_project_number_unique').on(table.projectId, table.number),
    index('github_issues_project_id_idx').on(table.projectId),
    index('github_issues_user_id_idx').on(table.userId),
  ],
);

export const githubPullRequests = pgTable(
  'github_pull_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    state: varchar('state', { length: 50 }).notNull(),
    url: text('url').notNull(),
    author: varchar('author', { length: 100 }).notNull(),
    isDraft: boolean('is_draft').default(false).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('github_pull_requests_project_number_unique').on(table.projectId, table.number),
    index('github_pull_requests_project_id_idx').on(table.projectId),
    index('github_pull_requests_user_id_idx').on(table.userId),
  ],
);
