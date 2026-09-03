"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { type TaskDto, type PaginatedResponse } from "@lifeos/shared";

export default function DashboardPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New task form state
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [creating, setCreating] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get<TaskDto[]>("/api/tasks");
      const data = (res as unknown as PaginatedResponse<TaskDto>).data ?? [];
      setTasks(data);
    } catch {
      setError("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!getToken()) {
      router.push("/login");
      return;
    }

    api
      .get<TaskDto[]>("/api/tasks")
      .then((res) => {
        if (!ignore) {
          const data = (res as unknown as PaginatedResponse<TaskDto>).data ?? [];
          setTasks(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setError("Failed to load tasks");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [router]);

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    try {
      await api.post("/api/tasks", { title: title.trim(), priority });
      setTitle("");
      setPriority("medium");
      await fetchTasks();
    } catch {
      setError("Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      await fetchTasks();
    } catch {
      setError("Failed to delete task");
    }
  }

  async function handleToggleStatus(task: TaskDto) {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await api.patch(`/api/tasks/${task.id}`, { status: newStatus });
      await fetchTasks();
    } catch {
      setError("Failed to update task");
    }
  }

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  const priorityColors: Record<string, string> = {
    low: "text-gray-400 bg-gray-800",
    medium: "text-blue-400 bg-blue-900/30",
    high: "text-amber-400 bg-amber-900/30",
    urgent: "text-red-400 bg-red-900/30",
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            LifeOS
          </h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Create task form */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            New Task
          </h2>
          <form onSubmit={handleCreateTask} className="flex gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </form>
        </section>

        {/* Task list */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">Tasks</h2>

          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-gray-800">
              <p className="text-gray-500">No tasks yet. Create your first task above.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 backdrop-blur-sm transition-colors hover:border-gray-700"
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      task.status === "done"
                        ? "border-green-500 bg-green-500/20 text-green-400"
                        : "border-gray-600 hover:border-gray-400"
                    }`}
                    aria-label={task.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                  >
                    {task.status === "done" && (
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Title */}
                  <span
                    className={`flex-1 ${
                      task.status === "done"
                        ? "line-through text-gray-500"
                        : "text-gray-100"
                    }`}
                  >
                    {task.title}
                  </span>

                  {/* Priority badge */}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      priorityColors[task.priority] || "text-gray-400 bg-gray-800"
                    }`}
                  >
                    {task.priority}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    aria-label="Delete task"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
