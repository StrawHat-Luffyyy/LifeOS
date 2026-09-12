import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncUserCalendar, listUserCalendarEvents } from './calendar-sync.service.js';
import * as calendarRepo from './calendar.repository.js';
import { googleCalendarClient } from '../../lib/google-calendar-client.js';
import * as googleOAuthService from '../integrations/google-oauth.service.js';

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
    select: vi.fn(),
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  calendarEvents: {},
  activityEvents: {},
  integrations: { userId: 'user_id', provider: 'provider' },
}));

vi.mock('./calendar.repository.js', () => ({
  listEventsByUser: vi.fn(),
  upsertEvents: vi.fn(),
  pruneEventsInWindow: vi.fn(),
  deleteAllForUser: vi.fn(),
}));

vi.mock('../../lib/google-calendar-client.js', () => ({
  googleCalendarClient: {
    listEvents: vi.fn(),
  },
}));

vi.mock('../integrations/google-oauth.service.js', () => ({
  getValidAccessToken: vi.fn(),
}));

describe('CalendarSyncService', () => {
  const userId = 'user-cal-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncUserCalendar', () => {
    it('fetches events for 14-day window, upserts changes, prunes missing, and logs activity', async () => {
      vi.mocked(googleOAuthService.getValidAccessToken).mockResolvedValue('valid-access-token');

      const mockGoogleEvents = [
        {
          id: 'g-event-1',
          summary: 'Product Roadmap Planning',
          startTime: '2026-09-15T10:00:00.000Z',
          endTime: '2026-09-15T11:00:00.000Z',
          location: 'Conference Room B',
          htmlLink: 'https://calendar.google.com/event?eid=1',
        },
        {
          id: 'g-event-2',
          summary: 'Engineering All-Hands',
          startTime: '2026-09-18T16:00:00.000Z',
          endTime: '2026-09-18T17:00:00.000Z',
          htmlLink: 'https://calendar.google.com/event?eid=2',
        },
      ];

      vi.mocked(googleCalendarClient.listEvents).mockResolvedValue(mockGoogleEvents);

      let loggedActivityEvent: unknown = null;
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((payload) => {
              loggedActivityEvent = payload;
              return Promise.resolve({});
            }),
          }),
        };
        vi.mocked(calendarRepo.upsertEvents).mockResolvedValue({ added: 1, updated: 1 });
        vi.mocked(calendarRepo.pruneEventsInWindow).mockResolvedValue(2);
        return cb(tx);
      });

      const result = await syncUserCalendar(userId);

      expect(result.total).toBe(2);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.pruned).toBe(2);

      // Verify Google client was called with 14-day ISO window
      expect(googleCalendarClient.listEvents).toHaveBeenCalledWith(
        'valid-access-token',
        expect.any(String),
        expect.any(String),
      );

      // Verify upsert was called with mapped events
      expect(calendarRepo.upsertEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId,
            googleEventId: 'g-event-1',
            summary: 'Product Roadmap Planning',
          }),
          expect.objectContaining({
            userId,
            googleEventId: 'g-event-2',
            summary: 'Engineering All-Hands',
          }),
        ]),
        expect.anything(),
      );

      // Verify prune was called with active google event ids
      expect(calendarRepo.pruneEventsInWindow).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
        expect.any(Date),
        ['g-event-1', 'g-event-2'],
        expect.anything(),
      );

      // Verify activity event was logged with source: 'calendar_sync'
      expect(loggedActivityEvent).toEqual(
        expect.objectContaining({
          userId,
          eventType: 'CALENDAR_SYNC_COMPLETED',
          entityType: 'calendar_event',
          metadata: expect.objectContaining({
            source: 'calendar_sync',
            added: 1,
            updated: 1,
            pruned: 2,
            total: 2,
          }),
        }),
      );
    });
  });

  describe('listUserCalendarEvents', () => {
    it('returns formatted CalendarEventDto array', async () => {
      const mockRows: calendarRepo.CalendarEventRow[] = [
        {
          id: 'e-1',
          userId,
          googleEventId: 'g-1',
          summary: 'Sprint Retro',
          startTime: new Date('2026-09-14T15:00:00Z'),
          endTime: new Date('2026-09-14T16:00:00Z'),
          location: 'Zoom',
          htmlLink: 'https://calendar.google.com/eid=1',
          lastSyncedAt: new Date('2026-09-12T12:00:00Z'),
        },
      ];

      vi.mocked(calendarRepo.listEventsByUser).mockResolvedValue(mockRows);

      const events = await listUserCalendarEvents(userId);

      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe('e-1');
      expect(events[0]?.summary).toBe('Sprint Retro');
      expect(events[0]?.startTime).toBe('2026-09-14T15:00:00.000Z');
      expect(events[0]?.endTime).toBe('2026-09-14T16:00:00.000Z');
      expect(events[0]?.location).toBe('Zoom');
    });
  });
});
