import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import * as calendarSyncService from './calendar-sync.service.js';
import { config } from '../../config/index.js';

vi.mock('./calendar-sync.service.js', () => ({
  listUserCalendarEvents: vi.fn(),
  syncUserCalendar: vi.fn(),
}));

describe('Calendar Routes (/api/calendar)', () => {
  const app = createApp();
  const userId = '11111111-1111-1111-1111-111111111111';
  const validToken = jwt.sign({ sub: userId, email: 'test@example.com' }, config.JWT_SECRET);
  const authHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when Authorization header is omitted on GET /api/calendar/events', async () => {
      const res = await request(app).get('/api/calendar/events');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when Authorization header is omitted on POST /api/calendar/sync', async () => {
      const res = await request(app).post('/api/calendar/sync');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/calendar/events', () => {
    it('returns 200 with user calendar events', async () => {
      vi.mocked(calendarSyncService.listUserCalendarEvents).mockResolvedValue([
        {
          id: 'ev-1',
          userId,
          googleEventId: 'g-1',
          summary: 'Quarterly Planning',
          startTime: '2026-09-15T09:00:00.000Z',
          endTime: '2026-09-15T10:00:00.000Z',
          location: 'HQ 2nd Floor',
          htmlLink: 'https://calendar.google.com/eid=1',
          lastSyncedAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app)
        .get('/api/calendar/events')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary).toBe('Quarterly Planning');
      expect(calendarSyncService.listUserCalendarEvents).toHaveBeenCalledWith(
        userId,
        undefined,
        undefined,
      );
    });
  });

  describe('POST /api/calendar/sync', () => {
    it('triggers calendar sync and returns 200 with sync results', async () => {
      vi.mocked(calendarSyncService.syncUserCalendar).mockResolvedValue({
        added: 3,
        updated: 1,
        pruned: 0,
        total: 4,
      });

      const res = await request(app)
        .post('/api/calendar/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        added: 3,
        updated: 1,
        pruned: 0,
        total: 4,
      });
      expect(calendarSyncService.syncUserCalendar).toHaveBeenCalledWith(userId);
    });
  });

  describe('Tenant Isolation', () => {
    it('passes authenticated user ID to the service ensuring cross-tenant isolation', async () => {
      const userBId = '22222222-2222-2222-2222-222222222222';
      const userBToken = jwt.sign({ sub: userBId, email: 'userb@example.com' }, config.JWT_SECRET);

      vi.mocked(calendarSyncService.listUserCalendarEvents).mockResolvedValue([]);

      await request(app)
        .get('/api/calendar/events')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(calendarSyncService.listUserCalendarEvents).toHaveBeenCalledWith(
        userBId,
        undefined,
        undefined,
      );
    });
  });
});
