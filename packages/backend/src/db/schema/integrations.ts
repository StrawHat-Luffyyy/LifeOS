import { pgTable, uuid, varchar, text, timestamp, jsonb, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull().default('github'),
    encryptedToken: text('encrypted_token').notNull(),
    iv: varchar('iv', { length: 100 }).notNull(),
    authTag: varchar('auth_tag', { length: 100 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('integrations_user_provider_unique').on(table.userId, table.provider),
    index('integrations_user_id_idx').on(table.userId),
  ],
);
