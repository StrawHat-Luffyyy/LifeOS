"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type DocumentDto,
  type DocumentChunkDto,
  type ProjectDto,
  type PaginatedResponse,
} from "@lifeos/shared";
import { api } from "@/lib/api";

interface DocumentManagerViewProps {
  projects: ProjectDto[];
  onDataMutated?: () => void;
}

export function DocumentManagerView({ projects, onDataMutated }: DocumentManagerViewProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chunks inspector modal state
  const [selectedDocForChunks, setSelectedDocForChunks] = useState<DocumentDto | null>(null);
  const [chunks, setChunks] = useState<DocumentChunkDto[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get<DocumentDto[]>("/api/documents?limit=50");
      const data = (res as unknown as PaginatedResponse<DocumentDto>).data ?? [];
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    api.get<DocumentDto[]>("/api/documents?limit=50").then((res) => {
      if (ignore) return;
      const data = (res as unknown as PaginatedResponse<DocumentDto>).data ?? [];
      setDocuments(data);
      setLoading(false);
    }).catch((err) => {
      if (ignore) return;
      setError(err instanceof Error ? err.message : "Failed to load documents");
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, []);

  // Polling for processing documents
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing" || d.status === "queued");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;

    try {
      setUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadTitle.trim()) {
        formData.append("title", uploadTitle.trim());
      }
      if (uploadProjectId) {
        formData.append("projectId", uploadProjectId);
      }

      await api.postForm("/api/documents", formData);

      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadProjectId("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      await fetchDocuments();
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.delete(`/api/documents/${docId}`);
      await fetchDocuments();
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  async function handleViewChunks(doc: DocumentDto) {
    setSelectedDocForChunks(doc);
    setLoadingChunks(true);
    try {
      const res = await api.get<DocumentChunkDto[]>(`/api/documents/${doc.id}/chunks`);
      const data = (res as unknown as { data: DocumentChunkDto[] }).data ?? [];
      setChunks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chunks");
    } finally {
      setLoadingChunks(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getStatusBadge(status: DocumentDto["status"], errorMessage: string | null) {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-950/80 text-blue-400 border border-blue-800/50 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping" />
            Processing
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/50">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Queued
          </span>
        );
      case "failed":
        return (
          <span
            title={errorMessage ?? "Ingestion failed"}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-950/80 text-red-400 border border-red-800/50 cursor-help"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Failed
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Upload action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <span>📄</span> Ingested Documents
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            PDF, Markdown, and text files indexed into vector memory for AI knowledge retrieval
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          data-testid="upload-document-btn"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
        >
          <span>+</span>
          <span>Upload Document</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* Documents List */}
      {loading ? (
        <div className="text-center py-8 text-xs text-gray-500 font-mono">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-800 bg-gray-900/30 text-gray-400">
          <div className="text-2xl mb-2">📁</div>
          <p className="text-sm font-medium text-gray-300">No documents ingested yet</p>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Upload PDFs, Markdown roadmaps, or notes. They will be chunked, embedded, and made searchable by LifeOS AI.
          </p>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="mt-4 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 border border-gray-700"
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => {
            const project = projects.find((p) => p.id === doc.projectId);
            return (
              <div
                key={doc.id}
                data-testid={`document-item-${doc.id}`}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-800 bg-gray-900/60 hover:bg-gray-900 hover:border-gray-700/80 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800 text-gray-300 border border-gray-700 text-xs font-mono uppercase">
                    {doc.fileType}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-200 truncate">{doc.title}</h4>
                      {getStatusBadge(doc.status, doc.errorMessage)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                      <span>{doc.fileName}</span>
                      <span>•</span>
                      <span>{formatSize(doc.fileSize)}</span>
                      {project && (
                        <>
                          <span>•</span>
                          <span className="text-blue-400/80">📁 {project.name}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {doc.status === "ready" && (
                    <button
                      onClick={() => handleViewChunks(doc)}
                      data-testid={`view-chunks-btn-${doc.id}`}
                      className="px-2.5 py-1 text-xs text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-700 rounded-md border border-gray-700/60 transition-colors"
                    >
                      View Chunks
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(doc.id)}
                    title="Delete document"
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

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-semibold text-gray-100">Upload Document</h3>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  File (PDF, TXT, or MD — max 10MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadTitle) {
                        setUploadTitle(f.name.replace(/\.[^/.]+$/, ""));
                      }
                    }
                  }}
                  className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600/30 file:cursor-pointer cursor-pointer border border-gray-800 rounded-lg p-1.5 bg-gray-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Document Title (optional)
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. LifeOS Phase 3 Requirements"
                  className="w-full px-3 py-2 text-xs bg-gray-950 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Associate with Project (optional)
                </label>
                <select
                  value={uploadProjectId}
                  onChange={(e) => setUploadProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-950 border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">None (Global)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {uploading ? "Uploading..." : "Upload & Ingest"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chunks Inspector Modal */}
      {selectedDocForChunks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                  <span>🧩</span> Chunks: {selectedDocForChunks.title}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Paragraph-aware chunks with pgvector embeddings
                </p>
              </div>
              <button
                onClick={() => setSelectedDocForChunks(null)}
                className="text-gray-500 hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingChunks ? (
                <div className="text-center py-8 text-xs text-gray-500 font-mono">Loading chunks...</div>
              ) : chunks.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">No chunks found</div>
              ) : (
                chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-3 rounded-xl border border-gray-800 bg-gray-950 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span className="font-mono text-purple-400">Chunk #{chunk.chunkIndex + 1}</span>
                      <span>{chunk.content.length} characters</span>
                    </div>
                    <p className="text-gray-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedDocForChunks(null)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 rounded-lg"
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
