"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type ProjectGitHubDataDto,
  type GitHubIssueDto,
  type GitHubPullRequestDto,
} from "@lifeos/shared";
import { api, ApiError } from "@/lib/api";

interface GitHubTabViewProps {
  projectId: string;
  onNavigateToSettings?: () => void;
}

export function GitHubTabView({ projectId, onNavigateToSettings }: GitHubTabViewProps) {
  const [data, setData] = useState<ProjectGitHubDataDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for linking
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Subtab & filter states
  const [subTab, setSubTab] = useState<"issues" | "prs">("issues");
  const [searchFilter, setSearchFilter] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await api.getProjectGitHub(projectId);
      setData(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load GitHub data");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let ignore = false;
    api.getProjectGitHub(projectId)
      .then((res) => {
        if (!ignore) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError("Failed to load GitHub data");
          }
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [projectId]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!repoOwner.trim() || !repoName.trim()) {
      setError("Both repository owner and repository name are required");
      return;
    }

    setLinking(true);
    setError(null);
    setSuccess(null);
    try {
      await api.linkGitHubRepo(projectId, repoOwner.trim(), repoName.trim());
      setRepoOwner("");
      setRepoName("");
      setSuccess("Repository linked successfully! Syncing initial issues and pull requests...");
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to link repository. Please check that your PAT has access.");
      }
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    setError(null);
    setSuccess(null);
    try {
      await api.unlinkGitHubRepo(projectId);
      setConfirmUnlink(false);
      setSuccess("Repository unlinked from project.");
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to unlink repository.");
      }
    } finally {
      setUnlinking(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.syncProjectGitHub(projectId);
      setSuccess(`Synced ${res.data.issueCount} issues and ${res.data.prCount} pull requests!`);
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Sync failed. Please verify your token in Settings.");
      }
    } finally {
      setSyncing(false);
    }
  }

  const isLinked = Boolean(data?.link);

  // Filter issues
  const filteredIssues = (data?.issues || []).filter((issue: GitHubIssueDto) => {
    const q = searchFilter.toLowerCase();
    return (
      issue.title.toLowerCase().includes(q) ||
      String(issue.number).includes(q) ||
      issue.author.toLowerCase().includes(q)
    );
  });

  // Filter PRs
  const filteredPRs = (data?.pullRequests || []).filter((pr: GitHubPullRequestDto) => {
    const q = searchFilter.toLowerCase();
    return (
      pr.title.toLowerCase().includes(q) ||
      String(pr.number).includes(q) ||
      pr.author.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-12 text-center text-sm text-gray-400">
        Loading GitHub information...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 text-sm text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 font-bold px-2"
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-900/30 p-4 text-sm text-emerald-200 flex items-center justify-between">
          <span>{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300 font-bold px-2"
          >
            ×
          </button>
        </div>
      )}

      {!isLinked ? (
        /* Not Linked: Link Repository Form */
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 backdrop-blur-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">
              🐙
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">Link a GitHub Repository</h3>
              <p className="text-sm text-gray-400 mt-0.5">
                Connect this project to a remote GitHub repository to display open issues, pull requests, and sync status.
              </p>
            </div>
          </div>

          <form onSubmit={handleLink} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="repo-owner" className="block text-xs font-medium text-gray-300 mb-1">
                  Owner / Organization
                </label>
                <input
                  id="repo-owner"
                  type="text"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.target.value)}
                  placeholder="e.g. facebook"
                  disabled={linking}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="repo-name" className="block text-xs font-medium text-gray-300 mb-1">
                  Repository Name
                </label>
                <input
                  id="repo-name"
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="e.g. react"
                  disabled={linking}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                data-testid="link-repo-btn"
                disabled={linking || !repoOwner.trim() || !repoName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
              >
                {linking ? "Validating & Linking..." : "Link Repository"}
              </button>

              {onNavigateToSettings && (
                <button
                  type="button"
                  onClick={onNavigateToSettings}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                  Need to configure your PAT? Open Settings
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        /* Linked State: Repository Info Bar & Issues/PRs Tabs */
        <div className="space-y-6">
          {/* Linked Repo Summary Card */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl">
                🐙
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <a
                    href={data?.link?.repoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-base font-bold text-gray-100 hover:text-indigo-400 transition-colors flex items-center gap-1"
                  >
                    <span>{data?.link?.repoOwner}/{data?.link?.repoName}</span>
                    <span className="text-xs text-gray-500">↗</span>
                  </a>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Linked
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Last synced: {data?.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleTimeString() : "Never"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="sync-now-btn"
                onClick={handleManualSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className={syncing ? "animate-spin" : ""}>🔄</span>
                <span>{syncing ? "Syncing..." : "Sync Now"}</span>
              </button>

              {!confirmUnlink ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  disabled={unlinking}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 rounded-lg transition-colors"
                >
                  Unlink
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-gray-800 p-1 rounded-lg border border-red-900/60">
                  <button
                    type="button"
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
                  >
                    {unlinking ? "Unlinking..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnlink(false)}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Subtabs & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab("issues")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                  subTab === "issues"
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
              >
                <span>Issues</span>
                <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[11px] text-gray-300">
                  {data?.issues.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab("prs")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                  subTab === "prs"
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
              >
                <span>Pull Requests</span>
                <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[11px] text-gray-300">
                  {data?.pullRequests.length || 0}
                </span>
              </button>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by title, #number, author..."
                className="w-full rounded-lg border border-gray-800 bg-gray-900/80 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Subtab Content */}
          {subTab === "issues" ? (
            <div className="space-y-2">
              {filteredIssues.length === 0 ? (
                <div className="rounded-xl border border-gray-800/80 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
                  {searchFilter ? "No issues match your filter." : "No open issues found in this repository."}
                </div>
              ) : (
                filteredIssues.map((issue: GitHubIssueDto) => (
                  <div
                    key={issue.id}
                    className="group rounded-lg border border-gray-800/90 bg-gray-900/50 p-3.5 hover:border-gray-700 hover:bg-gray-850/60 transition-all flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-indigo-400">
                          #{issue.number}
                        </span>
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm font-medium text-gray-200 hover:text-indigo-300 transition-colors"
                        >
                          {issue.title}
                        </a>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            issue.state === "open"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-purple-950 text-purple-300 border border-purple-800"
                          }`}
                        >
                          {issue.state}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>Opened by @{issue.author}</span>
                        {issue.labels && issue.labels.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {issue.labels.map((label: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="View on GitHub"
                      className="text-gray-500 hover:text-gray-300 p-1"
                    >
                      ↗
                    </a>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPRs.length === 0 ? (
                <div className="rounded-xl border border-gray-800/80 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
                  {searchFilter ? "No pull requests match your filter." : "No pull requests found in this repository."}
                </div>
              ) : (
                filteredPRs.map((pr: GitHubPullRequestDto) => (
                  <div
                    key={pr.id}
                    className="group rounded-lg border border-gray-800/90 bg-gray-900/50 p-3.5 hover:border-gray-700 hover:bg-gray-850/60 transition-all flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-purple-400">
                          #{pr.number}
                        </span>
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm font-medium text-gray-200 hover:text-purple-300 transition-colors"
                        >
                          {pr.title}
                        </a>
                        {pr.isDraft && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-800 text-gray-300 border border-gray-700">
                            Draft
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            pr.state === "open"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-purple-950 text-purple-300 border border-purple-800"
                          }`}
                        >
                          {pr.state}
                        </span>
                      </div>

                      <div className="text-xs text-gray-400">
                        <span>Submitted by @{pr.author}</span>
                      </div>
                    </div>

                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="View on GitHub"
                      className="text-gray-500 hover:text-gray-300 p-1"
                    >
                      ↗
                    </a>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
