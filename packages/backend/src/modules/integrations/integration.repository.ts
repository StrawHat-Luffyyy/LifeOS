import { eq, and } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { integrations } from '../../db/schema/index.js';

export type IntegrationRow = typeof integrations.$inferSelect;
export type IntegrationInsert = typeof integrations.$inferInsert;

/**
 * Find an integration by userId and provider.
 */
export async function findByUserIdAndProvider(
  userId: string,
  provider = 'github',
  tx: Database = db,
): Promise<IntegrationRow | undefined> {
  const [row] = await tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)));
  return row;
}

/**
 * Upsert an integration record: if the user already has this provider connected,
 * update the encrypted credentials, metadata, and connectedAt.
 */
export async function upsertIntegration(
  data: IntegrationInsert,
  tx: Database = db,
): Promise<IntegrationRow> {
  const [row] = await tx
    .insert(integrations)
    .values(data)
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        encryptedToken: data.encryptedToken,
        iv: data.iv,
        authTag: data.authTag,
        encryptedRefreshToken: data.encryptedRefreshToken,
        refreshTokenIv: data.refreshTokenIv,
        refreshTokenAuthTag: data.refreshTokenAuthTag,
        encryptedAccessToken: data.encryptedAccessToken,
        accessTokenIv: data.accessTokenIv,
        accessTokenAuthTag: data.accessTokenAuthTag,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
        metadata: data.metadata,
        connectedAt: data.connectedAt ?? new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to upsert integration');
  }

  return row;
}

/**
 * Updates only the access token credentials and expiration for an existing integration.
 */
export async function updateAccessToken(
  userId: string,
  provider: string,
  tokens: {
    encryptedAccessToken: string;
    accessTokenIv: string;
    accessTokenAuthTag: string;
    accessTokenExpiresAt: Date;
    encryptedToken?: string;
    iv?: string;
    authTag?: string;
  },
  tx: Database = db,
): Promise<IntegrationRow | undefined> {
  const [row] = await tx
    .update(integrations)
    .set({
      encryptedAccessToken: tokens.encryptedAccessToken,
      accessTokenIv: tokens.accessTokenIv,
      accessTokenAuthTag: tokens.accessTokenAuthTag,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      ...(tokens.encryptedToken ? { encryptedToken: tokens.encryptedToken } : {}),
      ...(tokens.iv ? { iv: tokens.iv } : {}),
      ...(tokens.authTag ? { authTag: tokens.authTag } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)))
    .returning();

  return row;
}

/**
 * Delete an integration by userId and provider.
 */
export async function deleteByUserIdAndProvider(
  userId: string,
  provider = 'github',
  tx: Database = db,
): Promise<IntegrationRow | undefined> {
  const [row] = await tx
    .delete(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)))
    .returning();

  return row;
}
