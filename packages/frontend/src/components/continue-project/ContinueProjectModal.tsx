'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { type ContinueProjectSummaryDto, type ContinueProjectCitationDto } from '@lifeos/shared';

interface ContinueProjectModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ContinueProjectModal({
  projectId,
  projectName,
  isOpen,
  onClose,
}: ContinueProjectModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ContinueProjectSummaryDto | null>(null);
  const [runMetadata, setRunMetadata] = useState<{
    tokensUsed: number;
    durationMs: number;
    runId: string;
  } | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<ContinueProjectCitationDto | null>(null);

  async function loadContinueProject() {
    setLoading(true);
    setError(null);
    setSummary(null);
    setSelectedCitation(null);
    try {
      const res = await api.continueProject(projectId);
      if (res.data) {
        if (res.data.status && res.data.status !== 'completed') {
          setError(`Agent run ended with status ${String(res.data.status)}: ${String(res.data.error || 'Execution stopped')}`);
        } else {
          setSummary((res.data.output || res.data.result) as ContinueProjectSummaryDto);
        }
        setRunMetadata({
          tokensUsed: Number(res.data.tokensUsed) || 0,
          durationMs: Number(res.data.durationMs) || 0,
          runId: String(res.data.runId || ''),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize project context');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    api.continueProject(projectId).then((res) => {
      if (!ignore) {
        if (res.data) {
          if (res.data.status && res.data.status !== 'completed') {
            setError(`Agent run ended with status ${String(res.data.status)}: ${String(res.data.error || 'Execution stopped')}`);
          } else {
            setSummary((res.data.output || res.data.result) as ContinueProjectSummaryDto);
          }
          setRunMetadata({
            tokensUsed: Number(res.data.tokensUsed) || 0,
            durationMs: Number(res.data.durationMs) || 0,
            runId: String(res.data.runId || ''),
          });
        }
        setLoading(false);
      }
    }).catch((err: unknown) => {
      if (!ignore) {
        setError(err instanceof Error ? err.message : 'Failed to synthesize project context');
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  // Render text replacing citation tokens [E1], [E2] with interactive pills
  const renderWithCitations = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[E\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/\[E(\d+)\]/);
      if (match) {
        const citationIndex = parseInt(match[1]!, 10);
        const citation = summary?.citations?.find((c) => c.index === citationIndex);
        return (
          <button
            key={index}
            onClick={() => setSelectedCitation(citation || null)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors border border-purple-200 dark:border-purple-700 cursor-pointer"
            title={citation ? `${citation.entityType}: ${citation.text}` : 'Evidence item'}
          >
            {part}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xl font-bold">
              ✨
            </span>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Continue Project: {projectName}
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-medium">
                  OD-3 Citation Enforced
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                LangGraph 3-node agent workflow summarizing state, progress, and next steps with verifiable citations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Synthesizing Project Context...
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Gathering structured tasks, activity, semantic note memories, and enforcing citation verification.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
              <p className="font-semibold">Execution Failed</p>
              <p className="text-xs mt-1">{error}</p>
              <button
                onClick={loadContinueProject}
                className="mt-3 px-3 py-1 text-xs font-semibold rounded-lg bg-red-100 dark:bg-red-900/60 hover:bg-red-200 text-red-800 dark:text-red-200 transition-colors"
              >
                Retry Run
              </button>
            </div>
          )}

          {!loading && !error && summary && (
            <>
              {/* Observability & Guardrails Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    Run ID: <code className="text-purple-600 dark:text-purple-400">{runMetadata?.runId.slice(0, 8)}</code>
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    ⏱️ {( (runMetadata?.durationMs || 0) / 1000 ).toFixed(2)}s <span className="text-zinc-400">(limit 45s)</span>
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    🎯 {runMetadata?.tokensUsed || 0} tokens <span className="text-zinc-400">(limit 8,000)</span>
                  </span>
                </div>
                <div>
                  {summary.citationStatus === 'clean' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold text-xs border border-emerald-200 dark:border-emerald-800">
                      ✓ Clean Citations (100% Grounded)
                    </span>
                  )}
                  {summary.citationStatus === 'retried' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold text-xs border border-amber-200 dark:border-amber-800">
                      ⚠️ Auto-Repaired via Validator Retry
                    </span>
                  )}
                  {summary.citationStatus === 'claim_stripped' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold text-xs border border-rose-200 dark:border-rose-800">
                      🛡️ Claim-Stripped Fallback Active
                    </span>
                  )}
                </div>
              </div>

              {/* 6 Structured Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Current State */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <span>📌</span> Current State
                  </h3>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {renderWithCitations(summary.currentState)}
                  </div>
                </div>

                {/* 2. Recent Progress */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span>🚀</span> Recent Progress
                  </h3>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {renderWithCitations(summary.recentProgress)}
                  </div>
                </div>

                {/* 3. Blockers */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span>⚠️</span> Blockers & Dependencies
                  </h3>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {renderWithCitations(summary.blockers)}
                  </div>
                </div>

                {/* 4. Suggested Next Step */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <span>⚡</span> Suggested Next Step
                  </h3>
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {renderWithCitations(summary.suggestedNextStep)}
                  </div>
                </div>

                {/* 5. Open Tasks */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <span>📋</span> Open Tasks
                  </h3>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {renderWithCitations(summary.openTasks)}
                  </div>
                </div>

                {/* 6. Recent Decisions */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <span>💡</span> Recent Decisions & Notes
                  </h3>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {renderWithCitations(summary.recentDecisions)}
                  </div>
                </div>
              </div>

              {/* Citations / Evidence Drawer */}
              {selectedCitation && (
                <div className="p-4 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                        [E{selectedCitation.index}]
                      </span>
                      Source Evidence: {selectedCitation.entityType.toUpperCase()}
                    </span>
                    <button
                      onClick={() => setSelectedCitation(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/70 p-3 rounded-lg border border-purple-100 dark:border-purple-900/50 font-mono">
                    {selectedCitation.text}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Click any [E#] tag to view underlying ground-truth evidence</span>
          <div className="flex items-center gap-2">
            <button
              onClick={loadContinueProject}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium transition-colors disabled:opacity-50"
            >
              Re-Synthesize
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
