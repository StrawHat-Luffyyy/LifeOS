"use client";

import { useState } from "react";
import {
  type ProjectDto,
  type TaskDto,
  type NoteDto,
  type ActivityEventDto,
  type Priority,
} from "@lifeos/shared";
import { TaskList } from "./TaskList";
import { NoteList } from "./NoteList";
import { ActivityFeed } from "./ActivityFeed";

interface ProjectViewProps {
  project: ProjectDto;
  tasks: TaskDto[];
  notes: NoteDto[];
  activity: ActivityEventDto[];
  onCreateTask: (title: string, priority: Priority, projectId?: string | null) => Promise<void>;
  onToggleTaskStatus: (task: TaskDto) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onCreateNote: (title: string, content: string, tags: string[], projectId?: string | null) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onSearchNotes: (query: string) => Promise<void>;
  onToggleProjectStatus: (project: ProjectDto) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  loading: boolean;
}

export function ProjectView({
  project,
  tasks,
  notes,
  activity,
  onCreateTask,
  onToggleTaskStatus,
  onDeleteTask,
  onCreateNote,
  onDeleteNote,
  onSearchNotes,
  onToggleProjectStatus,
  onDeleteProject,
  loading,
}: ProjectViewProps) {
  const [activeTab, setActiveTab] = useState<"tasks" | "notes" | "activity">("tasks");

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 backdrop-blur-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-100">{project.name}</h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                  project.status === "active"
                    ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                {project.status}
              </span>
            </div>
            {project.description && (
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{project.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleProjectStatus(project)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 transition-colors"
            >
              {project.status === "active" ? "Archive" : "Unarchive"}
            </button>
            <button
              onClick={() => onDeleteProject(project.id)}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50 hover:bg-red-900/20 text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 pt-4 gap-6">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "tasks"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "notes"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Notes ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "activity"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Activity
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "tasks" && (
        <TaskList
          tasks={tasks}
          currentProjectId={project.id}
          onCreateTask={onCreateTask}
          onToggleStatus={onToggleTaskStatus}
          onDeleteTask={onDeleteTask}
          loading={loading}
        />
      )}

      {activeTab === "notes" && (
        <NoteList
          notes={notes}
          currentProjectId={project.id}
          onCreateNote={onCreateNote}
          onDeleteNote={onDeleteNote}
          onSearchNotes={onSearchNotes}
          loading={loading}
        />
      )}

      {activeTab === "activity" && (
        <ActivityFeed events={activity} loading={loading} />
      )}
    </div>
  );
}
