import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as integrationRepo from './integration.repository.js';
import { githubClient } from '../../lib/github-client.js';
import { encryptToken, decryptToken } from '../../lib/encryption.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type IntegrationDto,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

function toIntegrationDto(row: integrationRepo.IntegrationRow): IntegrationDto {
  return {
    id: row.id,
    userId: row.userId,
    provider: 'github',
    metadata: row.metadata as IntegrationDto['metadata'],
    connectedAt: row.connectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Validates a GitHub Personal Access Token against GitHub API, encrypts it with AES-256-GCM,
 * stores the integration row, and logs an activity event.
 */
export async function connectGitHub(
  userId: string,
  token: string,
): Promise<IntegrationDto> {
  // 1. Validate token with GitHub
  const ghUser = await githubClient.validateToken(token);

  // 2. Encrypt token at rest
  const encrypted = encryptToken(token);

  // 3. Persist and log activity in a transaction
  const result = await db.transaction(async (tx) => {
    const row = await integrationRepo.upsertIntegration(
      {
        userId,
        provider: 'github',
        encryptedToken: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        metadata: {
          username: ghUser.login,
          avatarUrl: ghUser.avatarUrl,
          name: ghUser.name,
        },
        connectedAt: new Date(),
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GITHUB_CONNECTED' satisfies EventType,
      entityType: 'integration' satisfies EntityType,
      entityId: row.id,
      projectId: null,
      summary: `Connected GitHub account (@${ghUser.login})`,
      metadata: {
        provider: 'github',
        username: ghUser.login,
      },
    });

    return row;
  });

  return toIntegrationDto(result);
}

/**
 * Disconnects the GitHub integration, removing encrypted credentials from the database.
 */
export async function disconnectGitHub(userId: string): Promise<{ disconnected: true }> {
  const existing = await integrationRepo.findByUserIdAndProvider(userId, 'github');
  if (!existing) {
    throw new NotFoundError('GitHub integration');
  }

  await db.transaction(async (tx) => {
    await integrationRepo.deleteByUserIdAndProvider(userId, 'github', tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GITHUB_DISCONNECTED' satisfies EventType,
      entityType: 'integration' satisfies EntityType,
      entityId: existing.id,
      projectId: null,
      summary: 'Disconnected GitHub account',
      metadata: {
        provider: 'github',
      },
    });
  });

  return { disconnected: true };
}

/**
 * Returns the current user's GitHub integration status and metadata.
 * Never returns encrypted or plaintext tokens.
 */
export async function getConnection(userId: string): Promise<IntegrationDto | null> {
  const row = await integrationRepo.findByUserIdAndProvider(userId, 'github');
  if (!row) {
    return null;
  }
  return toIntegrationDto(row);
}

/**
 * Internal-only method: retrieves and decrypts the GitHub Personal Access Token.
 * Never expose via controllers or API responses.
 */
export async function getDecryptedToken(userId: string): Promise<string> {
  const row = await integrationRepo.findByUserIdAndProvider(userId, 'github');
  if (!row || !row.encryptedToken || !row.iv || !row.authTag) {
    throw new NotFoundError('GitHub integration not connected');
  }

  return decryptToken(row.encryptedToken, row.iv, row.authTag);
}
