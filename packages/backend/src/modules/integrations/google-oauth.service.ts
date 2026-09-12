import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import { googleCalendarClient } from '../../lib/google-calendar-client.js';
import { encryptToken, decryptToken } from '../../lib/encryption.js';
import { AppError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import * as integrationRepo from './integration.repository.js';
import {
  type IntegrationDto,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

function toGoogleIntegrationDto(row: integrationRepo.IntegrationRow): IntegrationDto {
  return {
    id: row.id,
    userId: row.userId,
    provider: 'google',
    metadata: row.metadata as IntegrationDto['metadata'],
    connectedAt: row.connectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Generates a Google OAuth authorization URL containing a signed state parameter.
 */
export function generateAuthUrl(userId: string): string {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment.',
      400,
      'GOOGLE_OAUTH_NOT_CONFIGURED',
    );
  }

  // Create signed state parameter (valid for 15 minutes)
  const state = jwt.sign({ userId, purpose: 'google_oauth' }, config.JWT_SECRET, {
    expiresIn: '15m',
  });

  return googleCalendarClient.getAuthorizationUrl({
    clientId: config.GOOGLE_CLIENT_ID,
    redirectUri: config.GOOGLE_REDIRECT_URI,
    state,
  });
}

/**
 * Validates the state parameter and exchanges the authorization code for access and refresh tokens.
 * Encrypts tokens at rest using AES-256-GCM and persists the integration row.
 */
export async function handleOAuthCallback(code: string, state: string): Promise<IntegrationDto> {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      'Google OAuth is not configured.',
      400,
      'GOOGLE_OAUTH_NOT_CONFIGURED',
    );
  }

  // 1. Verify signed state token
  let userId: string;
  try {
    const payload = jwt.verify(state, config.JWT_SECRET) as { userId: string; purpose?: string };
    if (!payload.userId || payload.purpose !== 'google_oauth') {
      throw new UnauthorizedError('Invalid OAuth state parameter');
    }
    userId = payload.userId;
  } catch {
    throw new UnauthorizedError('Invalid or expired OAuth state parameter');
  }

  // 2. Exchange authorization code with Google
  const tokens = await googleCalendarClient.exchangeCode({
    code,
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
  });

  // 3. Fetch connected Google account email
  const userInfo = await googleCalendarClient.getUserInfo(tokens.accessToken);

  // 4. Encrypt tokens at rest (AES-256-GCM)
  const encAccess = encryptToken(tokens.accessToken);
  const encRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined;
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  // 5. Persist integration and log activity event in a transaction
  const result = await db.transaction(async (tx) => {
    // If existing integration exists, preserve existing refresh token if Google didn't return a new one
    let existingRefreshToken = encRefresh?.ciphertext;
    let existingRefreshIv = encRefresh?.iv;
    let existingRefreshTag = encRefresh?.authTag;

    if (!tokens.refreshToken) {
      const existing = await integrationRepo.findByUserIdAndProvider(userId, 'google', tx);
      if (existing?.encryptedRefreshToken && existing.refreshTokenIv && existing.refreshTokenAuthTag) {
        existingRefreshToken = existing.encryptedRefreshToken;
        existingRefreshIv = existing.refreshTokenIv;
        existingRefreshTag = existing.refreshTokenAuthTag;
      }
    }

    const row = await integrationRepo.upsertIntegration(
      {
        userId,
        provider: 'google',
        encryptedToken: encAccess.ciphertext,
        iv: encAccess.iv,
        authTag: encAccess.authTag,
        encryptedAccessToken: encAccess.ciphertext,
        accessTokenIv: encAccess.iv,
        accessTokenAuthTag: encAccess.authTag,
        encryptedRefreshToken: existingRefreshToken,
        refreshTokenIv: existingRefreshIv,
        refreshTokenAuthTag: existingRefreshTag,
        accessTokenExpiresAt: expiresAt,
        metadata: {
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        },
        connectedAt: new Date(),
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GOOGLE_CALENDAR_CONNECTED' satisfies EventType,
      entityType: 'integration' satisfies EntityType,
      entityId: row.id,
      projectId: null,
      summary: `Connected Google Calendar (${userInfo.email})`,
      metadata: {
        provider: 'google',
        email: userInfo.email,
      },
    });

    return row;
  });

  return toGoogleIntegrationDto(result);
}

/**
 * Returns a valid plaintext access token for Google Calendar operations.
 * If the current access token is expired or within 5 minutes of expiring,
 * automatically uses the refresh token to get a new one from Google, updates the DB,
 * and returns the fresh access token.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const row = await integrationRepo.findByUserIdAndProvider(userId, 'google');
  if (!row) {
    throw new NotFoundError('Google Calendar integration not connected');
  }

  const bufferMs = 5 * 60 * 1000; // 5 minute safety buffer
  const isExpiringSoon =
    !row.accessTokenExpiresAt ||
    row.accessTokenExpiresAt.getTime() - Date.now() < bufferMs;

  if (isExpiringSoon) {
    // Must refresh token
    if (!row.encryptedRefreshToken || !row.refreshTokenIv || !row.refreshTokenAuthTag) {
      throw new AppError(
        'Google Calendar refresh token is missing. Please reconnect your account.',
        401,
        'GOOGLE_REFRESH_TOKEN_MISSING',
      );
    }

    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new AppError(
        'Google OAuth is not configured for token refresh.',
        500,
        'GOOGLE_OAUTH_NOT_CONFIGURED',
      );
    }

    // Decrypt refresh token
    const plaintextRefreshToken = decryptToken(
      row.encryptedRefreshToken,
      row.refreshTokenIv,
      row.refreshTokenAuthTag,
    );

    // Call Google's token refresh endpoint
    const refreshed = await googleCalendarClient.refreshAccessToken({
      refreshToken: plaintextRefreshToken,
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    });

    // Re-encrypt fresh access token
    const encAccess = encryptToken(refreshed.accessToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

    // Persist updated token in database
    await integrationRepo.updateAccessToken(userId, 'google', {
      encryptedAccessToken: encAccess.ciphertext,
      accessTokenIv: encAccess.iv,
      accessTokenAuthTag: encAccess.authTag,
      accessTokenExpiresAt: newExpiresAt,
      encryptedToken: encAccess.ciphertext,
      iv: encAccess.iv,
      authTag: encAccess.authTag,
    });

    return refreshed.accessToken;
  }

  // Token is still valid: decrypt and return
  const encrypted = row.encryptedAccessToken || row.encryptedToken;
  const iv = row.accessTokenIv || row.iv;
  const tag = row.accessTokenAuthTag || row.authTag;

  if (!encrypted || !iv || !tag) {
    throw new AppError(
      'Invalid integration record: missing access token credentials',
      500,
      'INVALID_INTEGRATION_RECORD',
    );
  }

  return decryptToken(encrypted, iv, tag);
}

/**
 * Disconnects the Google Calendar integration, removing stored tokens and logging an activity event.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<{ disconnected: true }> {
  const existing = await integrationRepo.findByUserIdAndProvider(userId, 'google');
  if (!existing) {
    throw new NotFoundError('Google Calendar integration');
  }

  await db.transaction(async (tx) => {
    await integrationRepo.deleteByUserIdAndProvider(userId, 'google', tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GOOGLE_CALENDAR_DISCONNECTED' satisfies EventType,
      entityType: 'integration' satisfies EntityType,
      entityId: existing.id,
      projectId: null,
      summary: 'Disconnected Google Calendar',
      metadata: {
        provider: 'google',
      },
    });
  });

  return { disconnected: true };
}

/**
 * Retrieves the user's Google Calendar connection status and sanitized metadata.
 * Never exposes plaintext or encrypted tokens.
 */
export async function getGoogleConnection(userId: string): Promise<IntegrationDto | null> {
  const row = await integrationRepo.findByUserIdAndProvider(userId, 'google');
  if (!row) {
    return null;
  }
  return toGoogleIntegrationDto(row);
}
