'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { type AgentRunDto, type AgentType } from '@lifeos/shared';

export function AgentRunsView() {
  const [runs, setRuns] = useState<AgentRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<AgentType | ''>('');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, [filterType]);

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await api.listAgentRuns({
        agentType: filterType || undefined,
        limit: 50,
      });
      if (res.data) {
        setRuns(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-zinc-900/40 via-purple-950/20 to-transparent border border-zinc-200 dark:border-zinc-800 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xl font-bold">
              🔍
            </span>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Agent Audit &amp; Observability
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              OD-7 &amp; FR-OBS-1
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
            Audit trail of LangGraph agent executions. Enforces 45s wall-clock and 8,000-token cumulative ceilings with strict chain-of-thought privacy isolation.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-purple-500 outline-none"
          >
            <option value="">All Agent Types</option>
            <option value="planner">Planner Agent</option>
            <option value="continue_project">Continue Project</option>
          </select>

          <button
            onClick={loadRuns}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Runs Table / Cards */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading audit trail...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-white/50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
          <span className="text-4xl">📋</span>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            No Agent Runs Recorded Yet
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Runs triggered by the Planner Agent or &ldquo;Continue Project&rdquo; workflow will appear here with execution metrics.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const isExpanded = expandedRunId === run.id;
            const durationMs = run.completedAt
              ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
              : 0;
            const durationSec = (durationMs / 1000).toFixed(2);
            const tokensUsed = (run.metadata?.tokensUsed as number) || 0;

            return (
              <div
                key={run.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* Summary Row */}
                <div
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold uppercase tracking-wider ${
                        run.agentType === 'planner'
                          ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                          : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                      }`}
                    >
                      {run.agentType === 'planner' ? '🧭 Planner' : '✨ Continue'}
                    </span>

                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {run.id.slice(0, 8)}
                        </code>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            run.status === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : run.status === 'timeout'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : run.status === 'budget_exceeded'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {new Date(run.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Guardrails / Resource Metrics (OD-7) */}
                  <div className="flex items-center gap-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <div className="text-right">
                      <p className="text-zinc-900 dark:text-zinc-200 font-semibold">
                        ⏱️ {durationSec}s
                      </p>
                      <p className="text-[10px] text-zinc-400">of 45s limit</p>
                    </div>

                    <div className="text-right">
                      <p className="text-zinc-900 dark:text-zinc-200 font-semibold">
                        🎯 {tokensUsed.toLocaleString()} tok
                      </p>
                      <p className="text-[10px] text-zinc-400">of 8,000 limit</p>
                    </div>

                    <span className="text-zinc-400 pl-2">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/80 space-y-4 text-xs">
                    {/* Step Execution Sequence (Non-CoT, FR-OBS-2) */}
                    <div>
                      <h4 className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                        LangGraph Execution Steps ({run.stepsSummary?.length || 0})
                      </h4>
                      <div className="space-y-1.5 pl-2 border-l-2 border-purple-500/40">
                        {run.stepsSummary?.map((step, idx) => (
                          <div key={idx} className="flex items-baseline gap-2">
                            <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
                              {step.step}:
                            </span>
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {step.description}
                            </span>
                            {step.timestamp && (
                              <span className="text-[10px] text-zinc-400 font-mono ml-auto">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Output Preview */}
                    {run.output && (
                      <div>
                        <h4 className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                          Output Payload
                        </h4>
                        <pre className="p-3 rounded-xl bg-zinc-900 text-zinc-100 font-mono text-[11px] overflow-x-auto max-h-60 border border-zinc-800">
                          {JSON.stringify(run.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
