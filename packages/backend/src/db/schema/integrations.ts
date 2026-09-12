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
    encryptedToken: text('encrypted_token'),
    iv: varchar('iv', { length: 100 }),
    authTag: varchar('auth_tag', { length: 100 }),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    refreshTokenIv: varchar('refresh_token_iv', { length: 100 }),
    refreshTokenAuthTag: varchar('refresh_token_auth_tag', { length: 100 }),
    encryptedAccessToken: text('encrypted_access_token'),
    accessTokenIv: varchar('access_token_iv', { length: 100 }),
    accessTokenAuthTag: varchar('access_token_auth_tag', { length: 100 }),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
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
