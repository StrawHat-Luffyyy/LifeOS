"use client";

import { useState, useEffect } from "react";
import { type CalendarEventDto, type IntegrationDto } from "@lifeos/shared";
import { api, ApiError } from "@/lib/api";

interface CalendarViewProps {
  onGoToSettings: () => void;
}

export function CalendarView({ onGoToSettings }: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [connection, setConnection] = useState<IntegrationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    Promise.all([
      api.getGoogleConnection().catch(() => ({ data: null })),
      api.getCalendarEvents().catch(() => ({ data: [] })),
    ])
      .then(([connRes, eventsRes]) => {
        if (!ignore) {
          setConnection(connRes.data);
          setEvents(eventsRes.data ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError("Failed to load calendar events");
          }
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncSuccess(null);
    try {
      const res = await api.syncCalendar();
      setSyncSuccess(`Synced ${res.data.total} events (${res.data.added} added, ${res.data.updated} updated, ${res.data.pruned} pruned)`);
      // Reload events
      const eventsRes = await api.getCalendarEvents();
      setEvents(eventsRes.data ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to synchronize calendar");
      }
    } finally {
      setSyncing(false);
    }
  }

  function formatEventTime(startIso: string, endIso: string): string {
    const start = new Date(startIso);
    const end = new Date(endIso);

    // Check if all-day event (starts at 00:00:00 and ends at 23:59:59 or 00:00:00 next day)
    const isAllDay =
      start.getUTCHours() === 0 &&
      start.getUTCMinutes() === 0 &&
      (end.getUTCHours() === 23 || end.getUTCHours() === 0);

    const dateStr = start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    if (isAllDay) {
      return `${dateStr} · All Day`;
    }

    const startTimeStr = start.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const endTimeStr = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${dateStr} · ${startTimeStr} – ${endTimeStr}`;
  }

  function getRelativeDateLabel(dateIso: string): string {
    const eventDate = new Date(dateIso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(eventDate);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 1 && diffDays < 7) {
      return eventDate.toLocaleDateString(undefined, { weekday: "long" });
    }
    return eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-6 max-w-4xl" data-testid="calendar-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <span>📅</span> Today / Upcoming Events
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Read-only schedule synced from your primary Google Calendar (rolling 14-day window).
          </p>
        </div>

        {connection && (
          <button
            type="button"
            data-testid="sync-calendar-btn"
            onClick={handleSync}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm self-start sm:self-auto"
          >
            <span>{syncing ? "🔄" : "⚡"}</span>
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        )}
      </div>

      {/* Status Alerts */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 text-sm text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 font-bold px-2"
          >
            ×
          </button>
        </div>
      )}

      {syncSuccess && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-900/30 p-4 text-sm text-emerald-200 flex items-center justify-between">
          <span>{syncSuccess}</span>
          <button
            onClick={() => setSyncSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300 font-bold px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-500">
          Loading calendar events...
        </div>
      ) : !connection ? (
        /* Not Connected Banner */
        <div
          data-testid="calendar-not-connected-card"
          className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center backdrop-blur-sm space-y-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/60 mx-auto flex items-center justify-center text-2xl">
            📅
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-200">Google Calendar Not Connected</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto mt-1">
              Connect your Google Calendar via OAuth 2.0 in Settings to view and sync your upcoming events inside LifeOS.
            </p>
          </div>
          <button
            type="button"
            data-testid="go-to-settings-btn"
            onClick={onGoToSettings}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <span>⚙️</span>
            <span>Go to Settings & Connect</span>
          </button>
        </div>
      ) : events.length === 0 ? (
        /* Connected but empty state */
        <div
          data-testid="calendar-empty-state"
          className="rounded-xl border border-gray-800 bg-gray-900/40 p-12 text-center space-y-3"
        >
          <div className="text-3xl">🌴</div>
          <h3 className="text-base font-medium text-gray-300">No Upcoming Events</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            No events found on your primary Google Calendar in the next 14 days. You’re all clear!
          </p>
        </div>
      ) : (
        /* Event List */
        <div className="space-y-3" data-testid="calendar-events-list">
          {events.map((event) => {
            const relLabel = getRelativeDateLabel(event.startTime);
            const isToday = relLabel === "Today";

            return (
              <div
                key={event.id}
                data-testid={`calendar-event-${event.id}`}
                className={`rounded-xl border p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isToday
                    ? "border-blue-500/40 bg-blue-950/20"
                    : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        isToday
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : "bg-gray-800 text-gray-400 border border-gray-700"
                      }`}
                    >
                      {relLabel}
                    </span>
                    <h4 className="text-base font-semibold text-gray-100 truncate">
                      {event.summary}
                    </h4>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1 text-gray-300">
                      <span>🕒</span>
                      <span>{formatEventTime(event.startTime, event.endTime)}</span>
                    </span>

                    {event.location && (
                      <span className="flex items-center gap-1 text-gray-400 truncate max-w-xs">
                        <span>📍</span>
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                  </div>
                </div>

                {event.htmlLink && (
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0 self-start sm:self-auto py-1 px-2.5 rounded border border-blue-900/40 bg-blue-950/40 hover:bg-blue-900/60"
                  >
                    <span>View in Google</span>
                    <span>↗</span>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
