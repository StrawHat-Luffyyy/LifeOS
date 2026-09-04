"use client";

import { useState, type FormEvent } from "react";
import { type ProjectDto } from "@lifeos/shared";

interface ProjectSidebarProps {
  projects: ProjectDto[];
  selectedScope: string; // 'all' | 'unassigned' | projectId
  onSelectScope: (scope: string) => void;
  onCreateProject: (name: string, description?: string) => Promise<void>;
  loading: boolean;
}

export function ProjectSidebar({
  projects,
  selectedScope,
  onSelectScope,
  onCreateProject,
  loading,
}: ProjectSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreateProject(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      setIsCreating(false);
    } catch {
      // Keep form open so user does not lose typed text
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="w-64 shrink-0 border-r border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-6">
      {/* Scope navigation */}
      <div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2 block">
          Views
        </span>
        <div className="space-y-1">
          <button
            onClick={() => onSelectScope("all")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
              selectedScope === "all"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>All Tasks</span>
          </button>

          <button
            onClick={() => onSelectScope("unassigned")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
              selectedScope === "unassigned"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Unassigned</span>
          </button>
        </div>
      </div>

      {/* Projects section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Projects
          </span>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1"
          >
            {isCreating ? "Cancel" : "+ New"}
          </button>
        </div>

        {/* Inline Create Project Form */}
        {isCreating && (
          <form onSubmit={handleFormSubmit} className="mb-3 p-3 rounded-lg border border-gray-700 bg-gray-800/90 space-y-2">
            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              autoFocus
              required
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs rounded border border-gray-600 bg-gray-900 px-2 py-1 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none h-14"
            />
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full text-xs py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </form>
        )}

        {/* Projects List */}
        <div className="space-y-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="text-xs text-gray-500 px-3 py-2">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="text-xs text-gray-500 px-3 py-2 italic">No projects yet</div>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectScope(project.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  selectedScope === project.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                    : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
                }`}
              >
                <span className="truncate">{project.name}</span>
                {project.status === "archived" && (
                  <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded uppercase">
                    Archived
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
