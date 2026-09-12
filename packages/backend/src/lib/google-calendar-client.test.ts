import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarClient } from './google-calendar-client.js';

describe('GoogleCalendarClient', () => {
  let client: GoogleCalendarClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new GoogleCalendarClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getAuthorizationUrl', () => {
    it('generates a valid Google OAuth consent URL with offline access and prompt', () => {
      const urlStr = client.getAuthorizationUrl({
        clientId: 'mock-client-id.apps.googleusercontent.com',
        redirectUri: 'http://localhost:4000/api/integrations/google/callback',
        state: 'signed-state-token-123',
      });

      const url = new URL(urlStr);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.pathname).toBe('/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('mock-client-id.apps.googleusercontent.com');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4000/api/integrations/google/callback');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('state')).toBe('signed-state-token-123');
      expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.readonly');
      expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/userinfo.email');
    });
  });

  describe('exchangeCode', () => {
    it('exchanges code for tokens successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'ya29.mock-access-token',
          refresh_token: '1//mock-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
        }),
      } as Response);

      const result = await client.exchangeCode({
        code: 'auth-code-123',
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
        redirectUri: 'http://localhost:4000/api/integrations/google/callback',
      });

      expect(result.accessToken).toBe('ya29.mock-access-token');
      expect(result.refreshToken).toBe('1//mock-refresh-token');
      expect(result.expiresIn).toBe(3600);
      expect(result.tokenType).toBe('Bearer');
    });

    it('throws AppError if Google rejects the code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Bad Request: Invalid Code',
        }),
      } as Response);

      await expect(
        client.exchangeCode({
          code: 'bad-code',
          clientId: 'mock-id',
          clientSecret: 'mock-secret',
          redirectUri: 'http://localhost:4000/callback',
        }),
      ).rejects.toThrow('Bad Request: Invalid Code');
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes token successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'ya29.new-access-token',
          expires_in: 3600,
        }),
      } as Response);

      const result = await client.refreshAccessToken({
        refreshToken: '1//mock-refresh-token',
        clientId: 'mock-id',
        clientSecret: 'mock-secret',
      });

      expect(result.accessToken).toBe('ya29.new-access-token');
      expect(result.expiresIn).toBe(3600);
    });

    it('throws AppError if refresh fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked',
        }),
      } as Response);

      await expect(
        client.refreshAccessToken({
          refreshToken: 'revoked-token',
          clientId: 'mock-id',
          clientSecret: 'mock-secret',
        }),
      ).rejects.toThrow('Token has been expired or revoked');
    });
  });

  describe('getUserInfo', () => {
    it('returns user email and name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          email: 'alice@gmail.com',
          name: 'Alice Walker',
          picture: 'https://lh3.googleusercontent.com/avatar.jpg',
        }),
      } as Response);

      const user = await client.getUserInfo('mock-access-token');
      expect(user.email).toBe('alice@gmail.com');
      expect(user.name).toBe('Alice Walker');
      expect(user.picture).toBe('https://lh3.googleusercontent.com/avatar.jpg');
    });
  });

  describe('listEvents', () => {
    it('parses timed and all-day events, filtering out cancelled events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'event-1',
              status: 'confirmed',
              summary: 'Sprint Review',
              start: { dateTime: '2026-09-15T14:00:00Z' },
              end: { dateTime: '2026-09-15T15:00:00Z' },
              location: 'Room 101',
              htmlLink: 'https://calendar.google.com/event?id=1',
            },
            {
              id: 'event-2',
              status: 'cancelled',
              summary: 'Cancelled 1:1',
              start: { dateTime: '2026-09-16T10:00:00Z' },
              end: { dateTime: '2026-09-16T11:00:00Z' },
            },
            {
              id: 'event-3',
              status: 'confirmed',
              summary: 'Company Hackathon',
              start: { date: '2026-09-18' },
              end: { date: '2026-09-18' },
              htmlLink: 'https://calendar.google.com/event?id=3',
            },
          ],
        }),
      } as Response);

      const events = await client.listEvents(
        'mock-token',
        '2026-09-15T00:00:00Z',
        '2026-09-29T00:00:00Z',
      );

      expect(events).toHaveLength(2);

      // Event 1 (timed)
      expect(events[0]?.id).toBe('event-1');
      expect(events[0]?.summary).toBe('Sprint Review');
      expect(events[0]?.startTime).toBe('2026-09-15T14:00:00Z');
      expect(events[0]?.endTime).toBe('2026-09-15T15:00:00Z');
      expect(events[0]?.location).toBe('Room 101');

      // Event 2 (cancelled) was filtered out

      // Event 3 (all-day normalized)
      expect(events[1]?.id).toBe('event-3');
      expect(events[1]?.summary).toBe('Company Hackathon');
      expect(events[1]?.startTime).toBe('2026-09-18T00:00:00.000Z');
      expect(events[1]?.endTime).toBe('2026-09-18T23:59:59.999Z');
    });

    it('throws AppError on calendar API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Calendar API quota exceeded',
            code: 403,
          },
        }),
      } as Response);

      await expect(
        client.listEvents('mock-token', '2026-09-15T00:00:00Z', '2026-09-29T00:00:00Z'),
      ).rejects.toThrow('Calendar API quota exceeded');
    });
  });
});
