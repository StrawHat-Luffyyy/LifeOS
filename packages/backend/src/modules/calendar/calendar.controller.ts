import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type CalendarEventDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as calendarSyncService from './calendar-sync.service.js';

/**
 * GET /api/calendar/events
 */
export async function getEvents(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const timeMin = typeof req.query['timeMin'] === 'string' ? req.query['timeMin'] : undefined;
    const timeMax = typeof req.query['timeMax'] === 'string' ? req.query['timeMax'] : undefined;

    const events = await calendarSyncService.listUserCalendarEvents(
      req.user.sub,
      timeMin,
      timeMax,
    );

    const response: ApiResponse<CalendarEventDto[]> = { success: true, data: events };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/calendar/sync
 * Triggers an immediate on-demand synchronization of the user's primary calendar.
 */
export async function sync(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await calendarSyncService.syncUserCalendar(req.user.sub);
    const response: ApiResponse<calendarSyncService.SyncCalendarResult> = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
