"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import {
  type ProjectDto,
  type TaskDto,
  type NoteDto,
  type ActivityEventDto,
  type PaginatedResponse,
  type Priority,
} from "@lifeos/shared";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TaskList } from "./components/TaskList";
import { ActivityFeed } from "./components/ActivityFeed";
import { ProjectView } from "./components/ProjectView";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [activity, setActivity] = useState<ActivityEventDto[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [globalTab, setGlobalTab] = useState<"tasks" | "activity">("tasks");

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get<ProjectDto[]>("/api/projects");
      const data = (res as unknown as PaginatedResponse<ProjectDto>).data ?? [];
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      let endpoint = "/api/tasks";
      if (selectedScope !== "all" && selectedScope !== "unassigned") {
        endpoint = `/api/tasks?projectId=${selectedScope}`;
      }
      const res = await api.get<TaskDto[]>(endpoint);
      let data = (res as unknown as PaginatedResponse<TaskDto>).data ?? [];
      if (selectedScope === "unassigned") {
        data = data.filter((t) => !t.projectId);
      }
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    }
  }, [selectedScope]);

  const fetchNotes = useCallback(async () => {
    try {
      let endpoint = "/api/notes";
      if (selectedScope !== "all" && selectedScope !== "unassigned") {
        endpoint = `/api/notes?projectId=${selectedScope}`;
      }
      const res = await api.get<NoteDto[]>(endpoint);
      const data = (res as unknown as PaginatedResponse<NoteDto>).data ?? [];
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  }, [selectedScope]);

  const fetchActivity = useCallback(async () => {
    try {
      let endpoint = "/api/activity";
      if (selectedScope !== "all" && selectedScope !== "unassigned") {
        endpoint = `/api/projects/${selectedScope}/activity`;
      }
      const res = await api.get<ActivityEventDto[]>(endpoint);
      const data = (res as unknown as PaginatedResponse<ActivityEventDto>).data ?? [];
      setActivity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    }
  }, [selectedScope]);

  // Initial load and scope synchronization
  useEffect(() => {
    let ignore = false;

    if (!getToken()) {
      router.push("/login");
      return;
    }

    let taskEndpoint = "/api/tasks";
    if (selectedScope !== "all" && selectedScope !== "unassigned") {
      taskEndpoint = `/api/tasks?projectId=${selectedScope}`;
    }

    let noteEndpoint = "/api/notes";
    if (selectedScope !== "all" && selectedScope !== "unassigned") {
      noteEndpoint = `/api/notes?projectId=${selectedScope}`;
    }

    let activityEndpoint = "/api/activity";
    if (selectedScope !== "all" && selectedScope !== "unassigned") {
      activityEndpoint = `/api/projects/${selectedScope}/activity`;
    }

    Promise.allSettled([
      api.get<ProjectDto[]>("/api/projects"),
      api.get<TaskDto[]>(taskEndpoint),
      api.get<NoteDto[]>(noteEndpoint),
      api.get<ActivityEventDto[]>(activityEndpoint),
    ]).then(([projResult, taskResult, noteResult, actResult]) => {
      if (ignore) return;

      const errors: string[] = [];

      if (projResult.status === "fulfilled") {
        setProjects((projResult.value as unknown as PaginatedResponse<ProjectDto>).data ?? []);
      } else {
        errors.push("Failed to load projects");
      }

      if (taskResult.status === "fulfilled") {
        let taskData = (taskResult.value as unknown as PaginatedResponse<TaskDto>).data ?? [];
        if (selectedScope === "unassigned") {
          taskData = taskData.filter((t) => !t.projectId);
        }
        setTasks(taskData);
      } else {
        errors.push("Failed to load tasks");
      }

      if (noteResult.status === "fulfilled") {
        setNotes((noteResult.value as unknown as PaginatedResponse<NoteDto>).data ?? []);
      } else {
        errors.push("Failed to load notes");
      }

      if (actResult.status === "fulfilled") {
        setActivity((actResult.value as unknown as PaginatedResponse<ActivityEventDto>).data ?? []);
      } else {
        errors.push("Failed to load activity");
      }

      if (errors.length > 0) {
        setError(errors.join(", "));
      } else {
        setError("");
      }
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [router, selectedScope]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  async function handleCreateProject(name: string, description?: string) {
    try {
      const res = await api.post<ProjectDto>("/api/projects", { name, description });
      await fetchProjects();
      await fetchActivity();
      if (res.data?.id) {
        setSelectedScope(res.data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      throw err;
    }
  }

  async function handleToggleProjectStatus(project: ProjectDto) {
    const newStatus = project.status === "active" ? "archived" : "active";
    try {
      await api.patch(`/api/projects/${project.id}`, { status: newStatus });
      await fetchProjects();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project status");
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      await api.delete(`/api/projects/${projectId}`);
      setSelectedScope("all");
      await fetchProjects();
      await fetchTasks();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

  async function handleCreateTask(title: string, priority: Priority, projectId?: string | null) {
    try {
      await api.post("/api/tasks", { title, priority, projectId });
      await fetchTasks();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  async function handleToggleTaskStatus(task: TaskDto) {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await api.patch(`/api/tasks/${task.id}`, { status: newStatus });
      await fetchTasks();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task status");
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      await fetchTasks();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    }
  }

  async function handleCreateNote(title: string, content: string, tags: string[], projectId?: string | null) {
    try {
      await api.post("/api/notes", { title, content, tags, projectId });
      await fetchNotes();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await api.delete(`/api/notes/${noteId}`);
      await fetchNotes();
      await fetchActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note");
    }
  }

  async function handleSearchNotes(query: string) {
    if (!query.trim()) {
      await fetchNotes();
      return;
    }
    try {
      let endpoint = `/api/notes/search?q=${encodeURIComponent(query.trim())}`;
      if (selectedScope !== "all" && selectedScope !== "unassigned") {
        endpoint += `&projectId=${selectedScope}`;
      }
      const res = await api.get<NoteDto[]>(endpoint);
      const data = (res as unknown as PaginatedResponse<NoteDto>).data ?? [];
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search notes");
    }
  }

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  const selectedProject = projects.find((p) => p.id === selectedScope);

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Top Navigation */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              LifeOS
            </h1>
            <span className="text-xs text-gray-500 font-mono">v0.4.0</span>
          </div>

          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Layout (Sidebar + Content) */}
      <div className="flex-1 flex overflow-hidden">
        <ProjectSidebar
          projects={projects}
          selectedScope={selectedScope}
          onSelectScope={setSelectedScope}
          onCreateProject={handleCreateProject}
          loading={loading}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Error Notification */}
            {error && (
              <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">
                  ✕
                </button>
              </div>
            )}

            {/* Scope View */}
            {selectedProject ? (
              <ProjectView
                project={selectedProject}
                tasks={tasks}
                notes={notes}
                activity={activity}
                onCreateTask={handleCreateTask}
                onToggleTaskStatus={handleToggleTaskStatus}
                onDeleteTask={handleDeleteTask}
                onCreateNote={handleCreateNote}
                onDeleteNote={handleDeleteNote}
                onSearchNotes={handleSearchNotes}
                onToggleProjectStatus={handleToggleProjectStatus}
                onDeleteProject={handleDeleteProject}
                loading={loading}
              />
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-100">
                      {selectedScope === "unassigned" ? "Unassigned Tasks" : "All Tasks & Activity"}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {selectedScope === "unassigned"
                        ? "Tasks without an assigned project"
                        : "Central dashboard view for all tasks and recent activity"}
                    </p>
                  </div>

                  {selectedScope === "all" && (
                    <div className="flex rounded-lg border border-gray-800 bg-gray-900 p-1">
                      <button
                        onClick={() => setGlobalTab("tasks")}
                        className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                          globalTab === "tasks" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Tasks
                      </button>
                      <button
                        onClick={() => setGlobalTab("activity")}
                        className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                          globalTab === "activity" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Activity
                      </button>
                    </div>
                  )}
                </div>

                {globalTab === "tasks" || selectedScope === "unassigned" ? (
                  <TaskList
                    tasks={tasks}
                    projects={projects}
                    currentProjectId={selectedScope === "unassigned" ? null : undefined}
                    onCreateTask={handleCreateTask}
                    onToggleStatus={handleToggleTaskStatus}
                    onDeleteTask={handleDeleteTask}
                    loading={loading}
                  />
                ) : (
                  <ActivityFeed events={activity} loading={loading} />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
