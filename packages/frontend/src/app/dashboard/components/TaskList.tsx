'use client';

import { useState, type FormEvent } from 'react';
import { type TaskDto, type Priority, type ProjectDto } from '@lifeos/shared';
import { api } from '@/lib/api';

interface TaskListProps {
  tasks: TaskDto[];
  projects?: ProjectDto[];
  currentProjectId?: string | null;
  onCreateTask: (title: string, priority: Priority, projectId?: string | null) => Promise<void>;
  onToggleStatus: (task: TaskDto) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRefreshTasks?: () => Promise<void>;
  loading: boolean;
}

const priorityColors: Record<string, string> = {
  low: 'text-gray-400 bg-gray-800',
  medium: 'text-blue-400 bg-blue-900/30',
  high: 'text-amber-400 bg-amber-900/30',
  urgent: 'text-red-400 bg-red-900/30',
};

export function TaskList({
  tasks,
  projects = [],
  currentProjectId,
  onCreateTask,
  onToggleStatus,
  onDeleteTask,
  onRefreshTasks,
  loading,
}: TaskListProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProjectId || '');
  const [creating, setCreating] = useState(false);

  // Dependency Management Modal State
  const [selectedTaskForDeps, setSelectedTaskForDeps] = useState<TaskDto | null>(null);
  const [dependencyTaskToAdd, setDependencyTaskToAdd] = useState<string>('');
  const [depLoading, setDepLoading] = useState<boolean>(false);
  const [depError, setDepError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const projId = currentProjectId !== undefined ? currentProjectId : (selectedProjectId || null);
      await onCreateTask(title.trim(), priority, projId);
      setTitle('');
      setPriority('medium');
    } finally {
      setCreating(false);
    }
  }

  async function handleAddDependency() {
    if (!selectedTaskForDeps || !dependencyTaskToAdd) return;
    setDepLoading(true);
    setDepError(null);
    try {
      await api.addTaskDependency(selectedTaskForDeps.id, dependencyTaskToAdd);
      setDependencyTaskToAdd('');
      if (onRefreshTasks) {
        await onRefreshTasks();
      }
      setSelectedTaskForDeps(null);
    } catch (err: any) {
      setDepError(err.message || 'Failed to add dependency');
    } finally {
      setDepLoading(false);
    }
  }

  async function handleRemoveDependency(dependsOnTaskId: string) {
    if (!selectedTaskForDeps) return;
    setDepLoading(true);
    setDepError(null);
    try {
      await api.removeTaskDependency(selectedTaskForDeps.id, dependsOnTaskId);
      if (onRefreshTasks) {
        await onRefreshTasks();
      }
      setSelectedTaskForDeps(null);
    } catch (err: any) {
      setDepError(err.message || 'Failed to remove dependency');
    } finally {
      setDepLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Task Form */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Add Task</h3>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          {currentProjectId === undefined && projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[160px]"
            >
              <option value="">No Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      {/* Task List items */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-800">
            <p className="text-gray-500 text-sm">No tasks found. Add a task above to get started.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-3.5 backdrop-blur-sm transition-colors hover:border-gray-700"
            >
              {/* Checkbox */}
              <button
                onClick={() => onToggleStatus(task)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  task.status === 'done'
                    ? 'border-green-500 bg-green-500/20 text-green-400'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
                aria-label={task.status === 'done' ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {task.status === 'done' && (
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>

              {/* Title & Status */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm block truncate ${
                      task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-100'
                    }`}
                  >
                    {task.title}
                  </span>

                  {/* Blocked Badge (P4-1) */}
                  {task.isBlocked && (
                    <span
                      data-testid={`task-blocked-badge-${task.id}`}
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-950/70 text-red-300 border border-red-800/80"
                      title={`Blocked by: ${(task.blockedBy || []).join(', ') || 'Prerequisite'}`}
                    >
                      ⚠️ Blocked by: {(task.blockedBy || []).join(', ') || 'Prerequisite'}
                    </span>
                  )}
                </div>

                {currentProjectId === undefined && task.projectId && (
                  <span className="text-[11px] text-gray-500 block mt-0.5">
                    {projects.find((p) => p.id === task.projectId)?.name || 'Project'}
                  </span>
                )}
              </div>

              {/* Priority badge */}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase text-[10px] ${
                  priorityColors[task.priority] || 'text-gray-400 bg-gray-800'
                }`}
              >
                {task.priority}
              </span>

              {/* Dependencies Action Button */}
              <button
                onClick={() => setSelectedTaskForDeps(task)}
                className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Manage Task Dependencies (P4-1)"
                data-testid={`manage-deps-btn-${task.id}`}
              >
                <span>🔗</span>
                <span className="text-[11px] hidden sm:inline">Deps</span>
              </button>

              {/* Delete button */}
              <button
                onClick={() => onDeleteTask(task.id)}
                className="text-gray-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                aria-label="Delete task"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Dependencies Modal (P4-1) */}
      {selectedTaskForDeps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 text-sm">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <span>🔗</span> Dependencies for &ldquo;{selectedTaskForDeps.title}&rdquo;
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Tasks this task depends on. Blocked tasks cannot be started and are never ranked #1 by Planner.
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedTaskForDeps(null);
                  setDepError(null);
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {depError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-xs">
                ⚠️ {depError}
              </div>
            )}

            {/* Currently Blocking List */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Prerequisites (Must complete first)
              </h4>
              {selectedTaskForDeps.dependencies && selectedTaskForDeps.dependencies.length > 0 ? (
                <div className="space-y-2">
                  {selectedTaskForDeps.dependencies.map((dep) => (
                    <div
                      key={dep.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60"
                    >
                      <span className="text-xs text-zinc-200">
                        {dep.dependsOnTaskTitle || dep.dependsOnTaskId}
                      </span>
                      <button
                        onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                        disabled={depLoading}
                        className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-300 hover:bg-red-900/70 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">No prerequisites configured. Task is unblocked.</p>
              )}
            </div>

            {/* Add Dependency Select */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Add Prerequisite Task
              </h4>
              <div className="flex gap-2">
                <select
                  value={dependencyTaskToAdd}
                  onChange={(e) => setDependencyTaskToAdd(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select a task that must finish first...</option>
                  {tasks
                    .filter((t) => t.id !== selectedTaskForDeps.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.priority})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleAddDependency}
                  disabled={depLoading || !dependencyTaskToAdd}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {depLoading ? 'Adding...' : 'Add Link'}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setSelectedTaskForDeps(null);
                  setDepError(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
