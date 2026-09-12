import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAuthUrl,
  handleOAuthCallback,
  getValidAccessToken,
  disconnectGoogleCalendar,
  getGoogleConnection,
} from './google-oauth.service.js';
import * as integrationRepo from './integration.repository.js';
import { googleCalendarClient } from '../../lib/google-calendar-client.js';
import { encryptToken } from '../../lib/encryption.js';
import { config } from '../../config/index.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  integrations: { id: 'id', userId: 'user_id', provider: 'provider' },
  activityEvents: {},
}));

vi.mock('./integration.repository.js', () => ({
  findByUserIdAndProvider: vi.fn(),
  upsertIntegration: vi.fn(),
  updateAccessToken: vi.fn(),
  deleteByUserIdAndProvider: vi.fn(),
}));

vi.mock('../../lib/google-calendar-client.js', () => ({
  googleCalendarClient: {
    getAuthorizationUrl: vi.fn(),
    exchangeCode: vi.fn(),
    refreshAccessToken: vi.fn(),
    getUserInfo: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    JWT_SECRET: 'test-secret-at-least-32-characters-long-12345',
    INTEGRATION_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/integrations/google/callback',
    CALENDAR_SYNC_INTERVAL_MINUTES: 15,
  },
}));

describe('GoogleOAuthService', () => {
  const userId = 'user-google-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (config as Record<string, unknown>)['GOOGLE_CLIENT_ID'] = 'test-client-id';
    (config as Record<string, unknown>)['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
  });

  describe('generateAuthUrl', () => {
    it('creates a signed state and returns authorization URL', () => {
      vi.mocked(googleCalendarClient.getAuthorizationUrl).mockReturnValue('https://accounts.google.com/auth');

      const url = generateAuthUrl(userId);
      expect(url).toBe('https://accounts.google.com/auth');
      expect(googleCalendarClient.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'test-client-id',
          state: expect.any(String),
        }),
      );

      const calledState = vi.mocked(googleCalendarClient.getAuthorizationUrl).mock.calls[0]?.[0].state;
      const decoded = jwt.verify(calledState!, config.JWT_SECRET) as { userId: string; purpose: string };
      expect(decoded.userId).toBe(userId);
      expect(decoded.purpose).toBe('google_oauth');
    });

    it('throws AppError if Google OAuth is not configured', () => {
      (config as Record<string, unknown>)['GOOGLE_CLIENT_ID'] = undefined;
      expect(() => generateAuthUrl(userId)).toThrow('Google OAuth is not configured');
    });
  });

  describe('handleOAuthCallback', () => {
    it('validates state, exchanges code, encrypts tokens, and persists integration', async () => {
      const state = jwt.sign({ userId, purpose: 'google_oauth' }, config.JWT_SECRET);

      vi.mocked(googleCalendarClient.exchangeCode).mockResolvedValue({
        accessToken: 'ya29.initial-access-token',
        refreshToken: '1//initial-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'calendar',
      });

      vi.mocked(googleCalendarClient.getUserInfo).mockResolvedValue({
        email: 'bob@gmail.com',
        name: 'Bob Google',
      });

      const mockRow: integrationRepo.IntegrationRow = {
        id: 'integration-uuid-1',
        userId,
        provider: 'google',
        encryptedToken: 'cipher-access',
        iv: 'iv-access',
        authTag: 'tag-access',
        encryptedAccessToken: 'cipher-access',
        accessTokenIv: 'iv-access',
        accessTokenAuthTag: 'tag-access',
        encryptedRefreshToken: 'cipher-refresh',
        refreshTokenIv: 'iv-refresh',
        refreshTokenAuthTag: 'tag-refresh',
        accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        metadata: { email: 'bob@gmail.com', name: 'Bob Google' },
        connectedAt: new Date('2026-09-12T10:00:00Z'),
        createdAt: new Date('2026-09-12T10:00:00Z'),
        updatedAt: new Date('2026-09-12T10:00:00Z'),
      };

      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }) };
        vi.mocked(integrationRepo.upsertIntegration).mockResolvedValue(mockRow);
        return cb(tx);
      });

      const result = await handleOAuthCallback('mock-code-123', state);

      expect(result.provider).toBe('google');
      expect(result.userId).toBe(userId);
      expect(result.metadata?.email).toBe('bob@gmail.com');
      expect(googleCalendarClient.exchangeCode).toHaveBeenCalledWith({
        code: 'mock-code-123',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: config.GOOGLE_REDIRECT_URI,
      });
      expect(integrationRepo.upsertIntegration).toHaveBeenCalled();
    });

    it('rejects invalid or forged state token with UnauthorizedError', async () => {
      await expect(handleOAuthCallback('mock-code', 'invalid-state-string')).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe('getValidAccessToken', () => {
    it('returns decrypted access token directly when token is not expired', async () => {
      const encAccess = encryptToken('current-valid-token');

      const mockRow: integrationRepo.IntegrationRow = {
        id: 'int-1',
        userId,
        provider: 'google',
        encryptedToken: encAccess.ciphertext,
        iv: encAccess.iv,
        authTag: encAccess.authTag,
        encryptedAccessToken: encAccess.ciphertext,
        accessTokenIv: encAccess.iv,
        accessTokenAuthTag: encAccess.authTag,
        encryptedRefreshToken: 'some-refresh-token',
        refreshTokenIv: 'iv',
        refreshTokenAuthTag: 'tag',
        accessTokenExpiresAt: new Date(Date.now() + 50 * 60 * 1000), // expires in 50 minutes
        metadata: { email: 'bob@gmail.com' },
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(mockRow);

      const token = await getValidAccessToken(userId);
      expect(token).toBe('current-valid-token');
      expect(googleCalendarClient.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes and updates access token when expiring within 5 minutes', async () => {
      const encRefresh = encryptToken('my-refresh-token');
      const encOldAccess = encryptToken('old-expiring-token');

      const mockRow: integrationRepo.IntegrationRow = {
        id: 'int-1',
        userId,
        provider: 'google',
        encryptedToken: encOldAccess.ciphertext,
        iv: encOldAccess.iv,
        authTag: encOldAccess.authTag,
        encryptedAccessToken: encOldAccess.ciphertext,
        accessTokenIv: encOldAccess.iv,
        accessTokenAuthTag: encOldAccess.authTag,
        encryptedRefreshToken: encRefresh.ciphertext,
        refreshTokenIv: encRefresh.iv,
        refreshTokenAuthTag: encRefresh.authTag,
        accessTokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // only 2 minutes left (< 5 min buffer)
        metadata: { email: 'bob@gmail.com' },
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(mockRow);
      vi.mocked(googleCalendarClient.refreshAccessToken).mockResolvedValue({
        accessToken: 'brand-new-refreshed-token',
        expiresIn: 3600,
      });

      const token = await getValidAccessToken(userId);

      expect(token).toBe('brand-new-refreshed-token');
      expect(googleCalendarClient.refreshAccessToken).toHaveBeenCalledWith({
        refreshToken: 'my-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      expect(integrationRepo.updateAccessToken).toHaveBeenCalledWith(
        userId,
        'google',
        expect.objectContaining({
          accessTokenExpiresAt: expect.any(Date),
        }),
      );
    });

    it('throws NotFoundError if Google integration does not exist', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(undefined);
      await expect(getValidAccessToken(userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('disconnectGoogleCalendar', () => {
    it('deletes integration and logs activity event', async () => {
      const mockRow = { id: 'int-1', userId } as integrationRepo.IntegrationRow;
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(mockRow);

      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }) };
        return cb(tx);
      });

      const result = await disconnectGoogleCalendar(userId);
      expect(result.disconnected).toBe(true);
      expect(integrationRepo.deleteByUserIdAndProvider).toHaveBeenCalledWith(userId, 'google', expect.anything());
    });
  });

  describe('getGoogleConnection', () => {
    it('returns sanitized DTO without exposing tokens', async () => {
      const mockRow: integrationRepo.IntegrationRow = {
        id: 'int-1',
        userId,
        provider: 'google',
        encryptedToken: 'secret',
        iv: 'secret',
        authTag: 'secret',
        encryptedAccessToken: 'secret',
        accessTokenIv: 'secret',
        accessTokenAuthTag: 'secret',
        encryptedRefreshToken: 'secret',
        refreshTokenIv: 'secret',
        refreshTokenAuthTag: 'secret',
        accessTokenExpiresAt: new Date(),
        metadata: { email: 'user@example.com' },
        connectedAt: new Date('2026-09-12T12:00:00Z'),
        createdAt: new Date('2026-09-12T12:00:00Z'),
        updatedAt: new Date('2026-09-12T12:00:00Z'),
      };

      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(mockRow);

      const conn = await getGoogleConnection(userId);
      expect(conn).not.toBeNull();
      expect(conn?.provider).toBe('google');
      expect(conn?.metadata?.email).toBe('user@example.com');
      expect((conn as unknown as Record<string, unknown>)['encryptedToken']).toBeUndefined();
      expect((conn as unknown as Record<string, unknown>)['encryptedAccessToken']).toBeUndefined();
      expect((conn as unknown as Record<string, unknown>)['encryptedRefreshToken']).toBeUndefined();
    });

    it('returns null if not connected', async () => {
      vi.mocked(integrationRepo.findByUserIdAndProvider).mockResolvedValue(undefined);
      const conn = await getGoogleConnection(userId);
      expect(conn).toBeNull();
    });
  });
});
