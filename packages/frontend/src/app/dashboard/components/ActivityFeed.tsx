"use client";

import { type ActivityEventDto } from "@lifeos/shared";

interface ActivityFeedProps {
  events: ActivityEventDto[];
  loading: boolean;
}

const eventTypeStyles: Record<string, { label: string; color: string }> = {
  TASK_CREATED: { label: "Task Added", color: "text-blue-400 bg-blue-900/30 border-blue-800/40" },
  TASK_UPDATED: { label: "Task Updated", color: "text-indigo-400 bg-indigo-900/30 border-indigo-800/40" },
  TASK_COMPLETED: { label: "Task Done", color: "text-green-400 bg-green-900/30 border-green-800/40" },
  TASK_DELETED: { label: "Task Deleted", color: "text-red-400 bg-red-900/30 border-red-800/40" },
  PROJECT_CREATED: { label: "Project Created", color: "text-purple-400 bg-purple-900/30 border-purple-800/40" },
  PROJECT_UPDATED: { label: "Project Updated", color: "text-purple-400 bg-purple-900/30 border-purple-800/40" },
  PROJECT_STATUS_CHANGED: { label: "Status Changed", color: "text-amber-400 bg-amber-900/30 border-amber-800/40" },
  PROJECT_DELETED: { label: "Project Deleted", color: "text-red-400 bg-red-900/30 border-red-800/40" },
  NOTE_CREATED: { label: "Note Added", color: "text-emerald-400 bg-emerald-900/30 border-emerald-800/40" },
  NOTE_UPDATED: { label: "Note Updated", color: "text-teal-400 bg-teal-900/30 border-teal-800/40" },
  NOTE_DELETED: { label: "Note Deleted", color: "text-red-400 bg-red-900/30 border-red-800/40" },
};

export function ActivityFeed({ events, loading }: ActivityFeedProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">Recent Activity</h3>

      {loading ? (
        <div className="text-center py-10 text-gray-500 text-sm">Loading activity...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-800">
          <p className="text-gray-500 text-sm">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-800">
          {events.map((event) => {
            const badge = eventTypeStyles[event.eventType] || {
              label: event.eventType,
              color: "text-gray-400 bg-gray-800 border-gray-700",
            };

            return (
              <div key={event.id} className="relative flex flex-col gap-1 text-sm">
                {/* Dot */}
                <div className="absolute -left-6 top-1.5 h-2 w-2 rounded-full border border-gray-700 bg-blue-500 ring-4 ring-gray-950" />

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(event.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-gray-300 text-sm font-medium">{event.summary}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
