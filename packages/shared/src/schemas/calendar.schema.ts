import { z } from 'zod';

/** Schema for querying calendar events */
export const listCalendarEventsSchema = z.object({
  query: z
    .object({
      timeMin: z.string().datetime().optional(),
      timeMax: z.string().datetime().optional(),
    })
    .optional(),
});

export type ListCalendarEventsQuery = z.input<typeof listCalendarEventsSchema>['query'];
