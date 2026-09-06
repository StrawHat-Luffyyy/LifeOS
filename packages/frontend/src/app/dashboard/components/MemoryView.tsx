"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  MemoryDto,
  MemoryCategory,
  MemorySourceType,
  PaginatedResponse,
} from "@lifeos/shared";
import { api } from "@/lib/api";

const MEMORY_CATEGORIES: MemoryCategory[] = ["fact", "decision", "preference", "goal"];


interface MemoryViewProps {
  onDataMutated?: () => void;
}

export function MemoryView({ onDataMutated }: MemoryViewProps) {
  const [memories, setMemories] = useState<MemoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [includeSuperseded, setIncludeSuperseded] = useState(false);

  // New Memory Modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      let url = "/api/memories?limit=50";
      if (selectedCategory !== "all") {
        url += `&category=${selectedCategory}`;
      }
      if (!includeSuperseded) {
        url += `&activeOnly=true`;
      }
      const res = await api.get<MemoryDto[]>(url);
      const data = (res as unknown as PaginatedResponse<MemoryDto>).data ?? [];
      setMemories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, includeSuperseded]);

  useEffect(() => {
    let ignore = false;
    let url = "/api/memories?limit=50";
    if (selectedCategory !== "all") {
      url += `&category=${selectedCategory}`;
    }
    if (!includeSuperseded) {
      url += `&activeOnly=true`;
    }

    api.get<MemoryDto[]>(url).then((res) => {
      if (ignore) return;
      const data = (res as unknown as PaginatedResponse<MemoryDto>).data ?? [];
      setMemories(data);
      setLoading(false);
    }).catch((err) => {
      if (ignore) return;
      setError(err instanceof Error ? err.message : "Failed to load memories");
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [selectedCategory, includeSuperseded]);

  async function handleCreateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      await api.post("/api/memories", {
        category: newCategory,
        content: newContent.trim(),
        sourceType: "user" as MemorySourceType,
      });

      setIsAddOpen(false);
      setNewContent("");
      setNewCategory("fact");
      await fetchMemories();
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store memory");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMemory(memoryId: string) {
    if (!confirm("Are you sure you want to delete this memory?")) return;
    try {
      await api.delete(`/api/memories/${memoryId}`);
      await fetchMemories();
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete memory");
    }
  }

  function getCategoryBadge(category: MemoryCategory) {
    switch (category) {
      case "preference":
        return {
          label: "Preference",
          className: "bg-purple-950/80 text-purple-400 border-purple-800/50",
          icon: "⭐",
        };
      case "goal":
        return {
          label: "Goal",
          className: "bg-amber-950/80 text-amber-400 border-amber-800/50",
          icon: "🎯",
        };
      case "fact":
        return {
          label: "Fact",
          className: "bg-blue-950/80 text-blue-400 border-blue-800/50",
          icon: "💡",
        };
      case "decision":
        return {
          label: "Decision",
          className: "bg-emerald-950/80 text-emerald-400 border-emerald-800/50",
          icon: "⚖️",
        };
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <span>🧠</span> Explicit Memory Bank
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Key facts, preferences, goals, and decisions remembered across AI conversations
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          data-testid="add-memory-btn"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors shadow-sm"
        >
          <span>+</span>
          <span>Add Memory</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedCategory === "all"
                ? "bg-purple-600/30 text-purple-300 border border-purple-500/50"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            All Categories
          </button>
          {MEMORY_CATEGORIES.map((cat) => {
            const badge = getCategoryBadge(cat);
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isSelected
                    ? `${badge.className} border`
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>{badge.icon}</span>
                <span className="capitalize">{cat}</span>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSuperseded}
            onChange={(e) => setIncludeSuperseded(e.target.checked)}
            className="rounded border-gray-700 bg-gray-900 text-purple-600 focus:ring-purple-500"
          />
          <span>Include superseded</span>
        </label>
      </div>

      {/* Memory Cards Grid */}
      {loading ? (
        <div className="text-center py-8 text-xs text-gray-500 font-mono">Loading memories...</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-800 bg-gray-900/30 text-gray-400">
          <div className="text-2xl mb-2">🧠</div>
          <p className="text-sm font-medium text-gray-300">No memories found</p>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Add facts, preferences, or goals that LifeOS AI should remember and apply to future answers and planning.
          </p>
          <button
            onClick={() => setIsAddOpen(true)}
            className="mt-4 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 border border-gray-700"
          >
            Create first memory
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {memories.map((mem) => {
            const badge = getCategoryBadge(mem.category);
            const isSuperseded = Boolean(mem.supersededBy);

            return (
              <div
                key={mem.id}
                data-testid={`memory-item-${mem.id}`}
                className={`p-4 rounded-xl border transition-all ${
                  isSuperseded
                    ? "border-gray-800/50 bg-gray-950/40 opacity-60"
                    : "border-gray-800 bg-gray-900/60 hover:bg-gray-900 hover:border-gray-700/80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${badge.className}`}
                      >
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>

                      <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700/50">
                        source: {mem.sourceType}
                      </span>

                      {isSuperseded && (
                        <span className="text-[10px] font-mono text-amber-400/90 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                          Superseded
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {mem.content}
                    </p>

                    <div className="text-[11px] text-gray-500">
                      Added {new Date(mem.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteMemory(mem.id)}
                    title="Delete memory"
                    className="p-1.5 text-gray-500 hover:text-red-400 rounded-md hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Memory Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-semibold text-gray-100">Add Memory</h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMemory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="w-full px-3 py-2 text-xs bg-gray-950 border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="fact">Fact — objective information</option>
                  <option value="preference">Preference — how you like things done</option>
                  <option value="goal">Goal — long-term objective</option>
                  <option value="decision">Decision — resolved choice or policy</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Memory Content</label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="e.g. Always write API endpoints using RESTful conventions and validate with Zod."
                  className="w-full px-3 py-2 text-xs bg-gray-950 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newContent.trim()}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {submitting ? "Saving..." : "Store Memory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
