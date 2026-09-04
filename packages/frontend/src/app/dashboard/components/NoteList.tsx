"use client";

import { useState, type FormEvent } from "react";
import { type NoteDto } from "@lifeos/shared";

interface NoteListProps {
  notes: NoteDto[];
  currentProjectId?: string | null;
  onCreateNote: (title: string, content: string, tags: string[], projectId?: string | null) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onSearchNotes: (query: string) => Promise<void>;
  loading: boolean;
}

export function NoteList({
  notes,
  currentProjectId,
  onCreateNote,
  onDeleteNote,
  onSearchNotes,
  loading,
}: NoteListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onCreateNote(title.trim(), content.trim(), tags, currentProjectId ?? null);
      setTitle("");
      setContent("");
      setTagsInput("");
      setIsCreating(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearchQuery(q);
    onSearchNotes(q);
  }

  return (
    <div className="space-y-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search notes by keyword..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full text-sm rounded-lg border border-gray-700 bg-gray-800/80 px-3.5 py-2 pl-9 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <svg
            className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 flex items-center gap-1.5"
        >
          {isCreating ? "Cancel" : "+ New Note"}
        </button>
      </div>

      {/* New Note Form */}
      {isCreating && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-700 bg-gray-800/90 p-5 space-y-3 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-gray-200">New Note</h3>
          <input
            type="text"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            required
            autoFocus
          />

          <input
            type="text"
            placeholder="Tags (comma separated, e.g. meeting, ideas)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full text-xs rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          <textarea
            placeholder="Write your note in Markdown..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full text-sm rounded-lg border border-gray-600 bg-gray-900 p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono resize-y"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Note"}
            </button>
          </div>
        </form>
      )}

      {/* Note Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-gray-800">
            <p className="text-gray-500 text-sm">No notes found. Create your first note above.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 backdrop-blur-sm hover:border-gray-700 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-base font-medium text-gray-100">{note.title}</h4>
                <button
                  onClick={() => onDeleteNote(note.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  aria-label="Delete note"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-gray-800 text-gray-400 text-[10px] px-2 py-0.5 font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {note.content && (
                <div className="text-sm text-gray-300 whitespace-pre-wrap pt-1 font-normal leading-relaxed">
                  {note.content}
                </div>
              )}

              <div className="pt-2 text-[11px] text-gray-500 flex items-center justify-between">
                <span>{new Date(note.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
