"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  type ConversationDto,
  type ConversationWithMessagesDto,
  type MessageDto,
  type ToolCallDto,
  type ChatStreamEvent,
  type ProjectDto,
  type RiskTier,
} from "@lifeos/shared";
import { api, getToken } from "@/lib/api";

interface ChatViewProps {
  projects: ProjectDto[];
  initialProjectId?: string | null;
  onDataMutated?: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getRiskTierBadge(tier: RiskTier) {
  switch (tier) {
    case "READ_ONLY":
      return { label: "READ ONLY", className: "bg-blue-900/30 text-blue-400 border-blue-800/50" };
    case "WRITE":
      return { label: "WRITE", className: "bg-amber-900/30 text-amber-400 border-amber-800/50" };
    case "DESTRUCTIVE":
      return { label: "DESTRUCTIVE", className: "bg-red-900/30 text-red-400 border-red-800/50" };
    case "EXTERNAL":
      return { label: "EXTERNAL", className: "bg-purple-900/30 text-purple-400 border-purple-800/50" };
    default:
      return { label: tier, className: "bg-gray-800 text-gray-400 border-gray-700" };
  }
}

interface ToolCardProps {
  tool: ToolCallDto;
}

function ToolActivityCard({ tool }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = getRiskTierBadge(tool.riskTier);

  return (
    <div
      data-testid="tool-activity-card"
      className="my-2 rounded-xl border border-gray-800 bg-gray-900/90 text-xs overflow-hidden shadow-sm transition-all"
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800/50"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60 text-[10px]">
            ⚡
          </span>
          <span className="font-mono font-medium text-gray-200">
            Called <span className="text-purple-300">{tool.toolName}</span>
          </span>
          <span
            className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-gray-500 hover:text-gray-300">
          <span>{expanded ? "Hide details" : "Show details"}</span>
          <svg
            className={`w-3.5 h-3.5 transform transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800/80 bg-gray-950/60 p-3 space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Inputs:</div>
            <pre className="font-mono text-[11px] text-gray-300 bg-gray-900/80 p-2 rounded-lg border border-gray-800 overflow-x-auto">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Result:</div>
            <pre className="font-mono text-[11px] text-emerald-400/90 bg-gray-900/80 p-2 rounded-lg border border-gray-800 overflow-x-auto">
              {JSON.stringify(tool.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatView({ projects, initialProjectId, onDataMutated }: ChatViewProps) {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationWithMessagesDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallDto[]>([]);
  const [pendingToolName, setPendingToolName] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, streamingText, activeToolCalls, pendingToolName]);

  const refreshConversationDetails = useCallback(async (id: string) => {
    try {
      const res = await api.get<ConversationWithMessagesDto>(`/api/conversations/${id}`);
      setActiveConversation(res.data);
    } catch (err) {
      console.error("Failed to load conversation details", err);
    }
  }, []);

  // Load conversations on mount or when project scope changes
  useEffect(() => {
    let ignore = false;
    const query = selectedProjectId ? `?projectId=${selectedProjectId}` : "";
    api
      .get<ConversationDto[]>(`/api/conversations${query}`)
      .then((res) => {
        if (!ignore) {
          setConversations(res.data);
          setLoading(false);
          if (res.data.length > 0) {
            setActiveConversationId((prev) => prev ?? res.data[0]?.id ?? null);
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          setLoading(false);
          console.error("Failed to load conversations", err);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedProjectId]);

  // Load active conversation details
  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    let ignore = false;
    api
      .get<ConversationWithMessagesDto>(`/api/conversations/${activeConversationId}`)
      .then((res) => {
        if (!ignore) {
          setActiveConversation(res.data);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Failed to load conversation details", err);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeConversationId]);

  async function handleCreateConversation() {
    try {
      const res = await api.post<ConversationDto>("/api/conversations", {
        title: "New Conversation",
        projectId: selectedProjectId ?? undefined,
      });
      setConversations((prev) => [res.data, ...prev]);
      setActiveConversationId(res.data.id);
    } catch (err) {
      console.error("Failed to create conversation", err);
    }
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.delete(`/api/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveConversationId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || streaming) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      try {
        const res = await api.post<ConversationDto>("/api/conversations", {
          title: inputMessage.trim().slice(0, 30),
          projectId: selectedProjectId ?? undefined,
        });
        targetConvId = res.data.id;
        setConversations((prev) => [res.data, ...prev]);
        setActiveConversationId(targetConvId);
      } catch (err) {
        console.error("Failed to create conversation on send", err);
        return;
      }
    }

    const messageContent = inputMessage.trim();
    setInputMessage("");

    // Optimistically append user message to UI
    const optimisticUserMsg: MessageDto = {
      id: `temp-${Date.now()}`,
      conversationId: targetConvId,
      role: "user",
      content: messageContent,
      status: "completed",
      createdAt: new Date().toISOString(),
    };

    setActiveConversation((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, optimisticUserMsg] }
        : {
            id: targetConvId!,
            userId: "",
            projectId: selectedProjectId,
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [optimisticUserMsg],
          },
    );

    // Start SSE stream
    setStreaming(true);
    setStreamingText("");
    setActiveToolCalls([]);
    setPendingToolName(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let didMutateData = false;

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: messageContent }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      const turnToolCalls: ToolCallDto[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              dataStr = line.slice(6).trim();
            }
          }

          if (dataStr === "[DONE]") {
            break;
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr) as ChatStreamEvent;

            if (parsed.type === "token") {
              setStreamingText((prev) => prev + parsed.content);
            } else if (parsed.type === "tool_call_start") {
              setPendingToolName(parsed.toolName);
            } else if (parsed.type === "tool_call_result") {
              setPendingToolName(null);
              const toolDto: ToolCallDto = {
                id: `tc-${Date.now()}-${turnToolCalls.length}`,
                conversationId: targetConvId!,
                messageId: null,
                toolName: parsed.toolName,
                riskTier: "WRITE",
                input: {},
                output: parsed.output,
                createdAt: new Date().toISOString(),
              };
              turnToolCalls.push(toolDto);
              setActiveToolCalls([...turnToolCalls]);

              // Check if write tool executed
              if (
                parsed.toolName === "createTask" ||
                parsed.toolName === "createNote" ||
                parsed.toolName === "updateTaskStatus"
              ) {
                didMutateData = true;
              }
            } else if (parsed.type === "message_complete") {
              // Final assistant message received
              setActiveConversation((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  messages: [...prev.messages, parsed.message],
                };
              });
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Stream error:", err);
      }
    } finally {
      setStreaming(false);
      setStreamingText("");
      setActiveToolCalls([]);
      setPendingToolName(null);
      abortControllerRef.current = null;

      // Refresh conversation details to ensure full DB synchronization
      if (targetConvId) {
        refreshConversationDetails(targetConvId);
      }

      // Notify parent dashboard if a task or note was created
      if (didMutateData && onDataMutated) {
        onDataMutated();
      }
    }
  }

  function handleStopStreaming() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-2xl border border-gray-800/80 bg-gray-950/80 overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Left Sidebar: Conversations list */}
      <div className="w-80 border-r border-gray-800/80 flex flex-col bg-gray-900/40">
        <div className="p-4 border-b border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 text-sm">
              💬
            </span>
            <h2 className="font-semibold text-gray-200 text-sm">Conversations</h2>
          </div>
          <button
            onClick={handleCreateConversation}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-sm"
          >
            <span>+</span> New Chat
          </button>
        </div>

        {/* Project filter selector */}
        {projects.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-800/60 bg-gray-950/40">
            <label className="text-[10px] uppercase font-semibold text-gray-500 block mb-1">
              Project Context
            </label>
            <select
              value={selectedProjectId || ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="w-full text-xs bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Projects (Global)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">Loading chats...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-gray-500 border border-dashed border-gray-800 rounded-xl m-2">
              No conversations yet. Start a new chat!
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveConversationId(c.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl text-xs cursor-pointer transition-all ${
                    isActive
                      ? "bg-blue-600/15 border border-blue-500/30 text-blue-100"
                      : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200 border border-transparent"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 truncate flex-1">
                    <span className="font-medium truncate">{c.title}</span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity"
                    title="Delete conversation"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-950/60">
        {/* Chat Header */}
        <div className="h-14 border-b border-gray-800/80 px-6 flex items-center justify-between bg-gray-900/30">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <span className="font-medium text-sm text-gray-200">
              {activeConversation?.title || "LifeOS AI Assistant"}
            </span>
            {selectedProjectId && (
              <span className="text-[10px] bg-purple-900/30 text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded-full">
                Linked to: {projects.find((p) => p.id === selectedProjectId)?.name || "Project"}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 font-mono">Model: qwen3:8b (Ollama)</div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-2xl shadow-lg shadow-blue-500/20">
                ✨
              </div>
              <h3 className="text-base font-semibold text-gray-200">How can I assist you today?</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                You can ask me to create tasks, organize notes, update task statuses, or summarize your projects.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full text-xs">
                <button
                  onClick={() => setInputMessage("Create a task called 'Test Phase 2 Chat' with high priority")}
                  className="p-2.5 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/60 text-left text-gray-300 transition-colors"
                >
                  {"👉 \"Create a task called 'Test Phase 2 Chat' with high priority\""}
                </button>
                <button
                  onClick={() => setInputMessage("Create a note titled 'Architecture Ideas' about AI integration")}
                  className="p-2.5 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/60 text-left text-gray-300 transition-colors"
                >
                  {"👉 \"Create a note titled 'Architecture Ideas' about AI integration\""}
                </button>
              </div>
            </div>
          ) : (
            activeConversation.messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-semibold uppercase text-gray-500">
                      {isUser ? "You" : "LifeOS AI"}
                    </span>
                    {m.status === "interrupted" && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-900/40 text-amber-300 border border-amber-800/50">
                        (interrupted)
                      </span>
                    )}
                  </div>

                  <div
                    className={`max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/10"
                        : "bg-gray-900/90 text-gray-200 border border-gray-800/80 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {/* Render tool calls associated with this message */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {m.toolCalls.map((tc) => (
                          <ToolActivityCard key={tc.id} tool={tc} />
                        ))}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              );
            })
          )}

          {/* Streaming assistant message in-flight */}
          {streaming && (
            <div className="flex flex-col items-start space-y-1">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-semibold uppercase text-purple-400">
                  LifeOS AI (Thinking...)
                </span>
              </div>

              <div className="max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed bg-gray-900/90 text-gray-200 border border-gray-800/80 rounded-bl-none shadow-sm">
                {/* Active executed tools during this stream */}
                {activeToolCalls.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {activeToolCalls.map((tc) => (
                      <ToolActivityCard key={tc.id} tool={tc} />
                    ))}
                  </div>
                )}

                {/* Pending tool execution indicator */}
                {pendingToolName && (
                  <div className="my-2 flex items-center gap-2 text-xs text-purple-300 bg-purple-950/40 border border-purple-800/40 px-3 py-2 rounded-xl animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
                    Executing tool: <code className="font-mono">{pendingToolName}</code>...
                  </div>
                )}

                <div className="whitespace-pre-wrap">
                  {streamingText}
                  <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-gray-800/80 bg-gray-900/30">
          <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={1}
              placeholder="Ask LifeOS to create a task, note, or check project status... (Enter to send)"
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-all"
            />

            {streaming ? (
              <button
                type="button"
                onClick={handleStopStreaming}
                className="px-4 py-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span>⏹</span> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                <span>Send</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
