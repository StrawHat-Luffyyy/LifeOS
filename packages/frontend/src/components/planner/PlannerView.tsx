'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { type PlannerOutputDto, type ProjectDto } from '@lifeos/shared';

interface PlannerViewProps {
  initialProjectId?: string | null;
}

export function PlannerView({ initialProjectId }: PlannerViewProps) {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [focus, setFocus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<PlannerOutputDto | null>(null);
  const [runMetadata, setRunMetadata] = useState<{
    tokensUsed: number;
    durationMs: number;
    runId: string;
  } | null>(null);
  const [acceptedTaskIds, setAcceptedTaskIds] = useState<Set<string>>(new Set());
  const [rejectedTaskIds, setRejectedTaskIds] = useState<Set<string>>(new Set());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    api.get<ProjectDto[]>('/api/projects').then((res) => {
      if (!ignore && res.data) {
        setProjects(res.data);
      }
    }).catch(() => {
      // Fallback
    });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleRunPlanner() {
    setLoading(true);
    setError(null);
    setActionNotice(null);
    try {
      const res = await api.runPlanner({
        projectId: selectedProjectId || undefined,
        focus: focus.trim() || undefined,
      });

      if (res.data) {
        if (res.data.status && res.data.status !== 'completed') {
          setError(`Planner run ended with status ${String(res.data.status)}: ${String(res.data.error || 'Execution stopped')}`);
        } else {
          setOutput((res.data.output || res.data.result) as PlannerOutputDto);
        }
        setRunMetadata({
          tokensUsed: Number(res.data.tokensUsed) || 0,
          durationMs: Number(res.data.durationMs) || 0,
          runId: String(res.data.runId || ''),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(taskId: string, title: string, rationale: string) {
    try {
      await api.acceptPlannerRecommendation(taskId, rationale);
      setAcceptedTaskIds((prev) => new Set([...prev, taskId]));
      setActionNotice(`Accepted & Started "${title}" — Task status updated to in-progress and logged to timeline.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept recommendation');
    }
  }

  async function handleReject(taskId: string, title: string, rationale: string) {
    try {
      await api.rejectPlannerRecommendation(taskId, rationale);
      setRejectedTaskIds((prev) => new Set([...prev, taskId]));
      setActionNotice(`Logged rejection for "${title}" to Activity timeline.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject recommendation');
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-purple-900/20 via-indigo-900/10 to-transparent border border-purple-200/50 dark:border-purple-900/50 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xl font-bold">
              🧭
            </span>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Planner Agent
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              LangGraph Multi-Factor
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
            Weighs priority, due dates, project goals, and hard dependency graph constraints. Blocked tasks are guaranteed never ranked #1 (P4-4).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-purple-500 outline-none"
          >
            <option value="">All Projects (Global)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Focus (e.g. urgent, quick wins)..."
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-purple-500 outline-none w-52"
          />

          <button
            onClick={handleRunPlanner}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-md hover:shadow-purple-500/25 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Planning...
              </>
            ) : (
              <>⚡ Generate Plan</>
            )}
          </button>
        </div>
      </div>

      {/* Action Notice Toast */}
      {actionNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between animate-fade-in">
          <span>✓ {actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            className="text-emerald-600 dark:text-emerald-400 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
          <p className="font-semibold">Planning Failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Observability & Guardrails Banner */}
      {runMetadata && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-zinc-600 dark:text-zinc-300 font-medium">
              Run ID: <code className="text-purple-600 dark:text-purple-400">{runMetadata.runId.slice(0, 8)}</code>
            </span>
            <span className="text-zinc-600 dark:text-zinc-300 font-medium">
              ⏱️ {(runMetadata.durationMs / 1000).toFixed(2)}s <span className="text-zinc-400">(45s timeout ceiling)</span>
            </span>
            <span className="text-zinc-600 dark:text-zinc-300 font-medium">
              🎯 {runMetadata.tokensUsed} tokens <span className="text-zinc-400">(8,000 budget ceiling)</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium text-xs">
              {output?.unblockedCount || 0} Actionable
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium text-xs">
              {output?.blockedCount || 0} Blocked
            </span>
          </div>
        </div>
      )}

      {/* Rationale Card */}
      {output && (
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
            <span>💡</span> Prioritization Strategy & Rationale
          </h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
            {output.rationale}
          </p>
        </div>
      )}

      {/* Recommendations List */}
      {output && output.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
            Ranked Action Items ({output.recommendations.length})
          </h3>

          <div className="space-y-2.5">
            {output.recommendations.map((rec) => {
              const isAccepted = acceptedTaskIds.has(rec.taskId);
              const isRejected = rejectedTaskIds.has(rec.taskId);

              return (
                <div
                  key={rec.taskId}
                  className={`p-4 rounded-2xl border transition-all ${
                    rec.rank === 1
                      ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 shadow-sm'
                      : 'bg-white dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Rank pill */}
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${
                          rec.rank === 1
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        #{rec.rank}
                      </span>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {rec.taskTitle}
                          </h4>

                          {/* Priority badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              rec.priority === 'urgent'
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                : rec.priority === 'high'
                                ? 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300'
                                : rec.priority === 'medium'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {rec.priority}
                          </span>

                          {/* Blocked vs Actionable badge */}
                          {rec.isBlocked ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
                              ⚠️ BLOCKED BY: {rec.blockingTaskTitles?.join(', ') || 'Prerequisite'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              ✓ Actionable
                            </span>
                          )}

                          {rec.dueDate && (
                            <span className="text-xs text-zinc-400">
                              Due: {new Date(rec.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
                          {rec.rationale}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons (Addendum B-3: Explicit "Accept & Start") */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isAccepted ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                          ✓ In-Progress
                        </span>
                      ) : isRejected ? (
                        <span className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-semibold">
                          Rejected
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleReject(rec.taskId, rec.taskTitle, rec.rationale)}
                            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleAccept(rec.taskId, rec.taskTitle, rec.rationale)}
                            disabled={rec.isBlocked}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1 cursor-pointer ${
                              rec.isBlocked
                                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-purple-500/25'
                            }`}
                            title={rec.isBlocked ? 'Cannot start a blocked task' : 'Accept recommendation and start task now'}
                          >
                            Accept & Start
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !output && (
        <div className="py-20 text-center space-y-3 bg-white/50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
          <span className="text-4xl">🧭</span>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Ready to Plan Your Work
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Select a project (or plan globally), optionally add a focus criteria, and click &ldquo;Generate Plan&rdquo; to have the Planner Agent evaluate your open tasks.
          </p>
        </div>
      )}
    </div>
  );
}
