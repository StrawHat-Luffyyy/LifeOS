"use client";

import { useState, useEffect } from "react";
import { type IntegrationDto } from "@lifeos/shared";
import { api, ApiError } from "@/lib/api";

export function SettingsView() {
  const [githubConnection, setGithubConnection] = useState<IntegrationDto | null>(null);
  const [googleConnection, setGoogleConnection] = useState<IntegrationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("integration") === "google" && urlParams.get("status") === "error") {
        return urlParams.get("message") || "Failed to connect Google Calendar. Please try again.";
      }
    }
    return null;
  });
  const [success, setSuccess] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("integration") === "google" && urlParams.get("status") === "success") {
        return "Google Calendar connected successfully!";
      }
    }
    return null;
  });
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmGoogleDisconnect, setConfirmGoogleDisconnect] = useState(false);

  useEffect(() => {
    let ignore = false;

    // Clean URL parameters returned from OAuth callback
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("integration") === "google") {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    Promise.all([
      api.getGitHubConnection().then((res) => res.data).catch(() => null),
      api.getGoogleConnection().then((res) => res.data).catch(() => null),
    ]).then(([gh, google]) => {
      if (!ignore) {
        setGithubConnection(gh);
        setGoogleConnection(google);
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  async function handleConnectGitHub(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError("Please provide a Personal Access Token");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.connectGitHub(tokenInput.trim());
      setGithubConnection(res.data);
      setTokenInput("");
      setSuccess("GitHub account connected successfully!");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to connect GitHub. Please verify your token and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnectGitHub() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.disconnectGitHub();
      setGithubConnection(null);
      setConfirmDisconnect(false);
      setSuccess("GitHub account disconnected.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to disconnect GitHub.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectGoogle() {
    setGoogleConnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.getGoogleAuthUrl();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error("Missing authorization URL from server");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to start Google OAuth flow. Please ensure GOOGLE_CLIENT_ID is configured.");
      }
      setGoogleConnecting(false);
    }
  }

  async function handleDisconnectGoogle() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.disconnectGoogle();
      setGoogleConnection(null);
      setConfirmGoogleDisconnect(false);
      setSuccess("Google Calendar disconnected.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to disconnect Google Calendar.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <span>⚙️</span> Settings & Integrations
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Manage third-party service connections and application preferences.
        </p>
      </div>

      {/* Status Alerts */}
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

      {/* Google Calendar Integration Card (Phase 5b) */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 backdrop-blur-sm space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-xl">
              📅
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">Google Calendar (Read-Only)</h3>
              <p className="text-xs text-gray-400">
                Sync upcoming events from your primary Google Calendar to LifeOS.
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-xs text-gray-500">Checking...</span>
          ) : googleConnection ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
              Not Connected
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-500">Loading integration status...</div>
        ) : googleConnection ? (
          /* Connected State */
          <div className="space-y-4 pt-2 border-t border-gray-800">
            <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sm font-semibold text-blue-300">
                  📅
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-200">
                    {googleConnection.metadata?.email || "Google Account"}
                  </div>
                  <div className="text-xs text-gray-500">
                    Connected on {new Date(googleConnection.connectedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {!confirmGoogleDisconnect ? (
                <button
                  type="button"
                  data-testid="disconnect-google-btn"
                  onClick={() => setConfirmGoogleDisconnect(true)}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 border border-red-900/60 rounded-md transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="confirm-disconnect-google-btn"
                    onClick={handleDisconnectGoogle}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors"
                  >
                    {saving ? "Disconnecting..." : "Confirm Disconnect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmGoogleDisconnect(false)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span>🔒</span>
              <span>OAuth tokens are encrypted at rest with AES-256-GCM. Scoped to read-only calendar access.</span>
            </div>
          </div>
        ) : (
          /* Disconnected State */
          <div className="space-y-4 pt-2 border-t border-gray-800">
            <p className="text-sm text-gray-400">
              Connect your Google account using secure OAuth 2.0 to sync events for a rolling 14-day window.
            </p>
            <button
              type="button"
              data-testid="connect-google-btn"
              onClick={handleConnectGoogle}
              disabled={googleConnecting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
            >
              <span>📅</span>
              <span>{googleConnecting ? "Connecting to Google..." : "Connect Google Calendar"}</span>
            </button>
          </div>
        )}
      </div>

      {/* GitHub Integration Card (Phase 5a) */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 backdrop-blur-sm space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl">
              🐙
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">GitHub (Read-Only)</h3>
              <p className="text-xs text-gray-400">
                Sync open issues, pull requests, and development activity to LifeOS projects.
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-xs text-gray-500">Checking...</span>
          ) : githubConnection ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
              Not Connected
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-500">Loading integration details...</div>
        ) : githubConnection ? (
          /* Connected State */
          <div className="space-y-4 pt-2 border-t border-gray-800">
            <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-3">
                {githubConnection.metadata?.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={githubConnection.metadata.avatarUrl as string}
                    alt="GitHub avatar"
                    className="w-10 h-10 rounded-full border border-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-200">
                    {((githubConnection.metadata?.username as string) || "GH")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-gray-200">
                    @{githubConnection.metadata?.username || "Unknown"}
                  </div>
                  <div className="text-xs text-gray-500">
                    Connected on {new Date(githubConnection.connectedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {!confirmDisconnect ? (
                <button
                  type="button"
                  data-testid="disconnect-github-btn"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 border border-red-900/60 rounded-md transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="confirm-disconnect-btn"
                    onClick={handleDisconnectGitHub}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors"
                  >
                    {saving ? "Disconnecting..." : "Confirm Disconnect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <span>🔒</span>
              <span>PAT encrypted at rest with AES-256-GCM. Plaintext tokens are never stored or exposed.</span>
            </div>
          </div>
        ) : (
          /* Disconnected State — Connect Form */
          <form onSubmit={handleConnectGitHub} className="space-y-4 pt-2 border-t border-gray-800">
            <div>
              <label htmlFor="pat-input" className="block text-xs font-medium text-gray-300 mb-1.5">
                Personal Access Token (Classic or Fine-Grained)
              </label>
              <div className="relative">
                <input
                  id="pat-input"
                  data-testid="pat-input"
                  type={showToken ? "text" : "password"}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
              <a
                href="https://github.com/settings/tokens/new?description=LifeOS&scopes=repo"
                target="_blank"
                rel="noreferrer noopener"
                className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
              >
                <span>Generate a new Personal Access Token on GitHub</span>
                <span>↗</span>
              </a>
              <span className="text-gray-500">Requires repository read access</span>
            </div>

            <button
              type="submit"
              data-testid="connect-github-btn"
              disabled={saving || !tokenInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
            >
              {saving ? "Validating & Connecting..." : "Connect GitHub"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
