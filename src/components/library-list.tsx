"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type LibraryEntry = {
  id: string;
  title: string;
  format: "epub" | "pdf";
  lastOpenedAt?: string;
};

function formatLastOpened(value?: string): string | null {
  if (!value) return null;
  const opened = new Date(value);
  if (Number.isNaN(opened.getTime())) return null;
  return opened.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LibraryList({ documents }: { documents: readonly LibraryEntry[] }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rename(id: string) {
    const title = draftTitle.trim();
    if (!title) return;
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${id}`, {
        body: JSON.stringify({ title }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Rename failed.");
      setRenaming(null);
      router.refresh();
    } catch {
      setError("The document could not be renamed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Remove “${title}” from the library? This deletes the imported file.`)) {
      return;
    }
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      router.refresh();
    } catch {
      setError("The document could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  if (documents.length === 0) {
    return (
      <p className="max-w-prose text-zinc-600 dark:text-zinc-400">
        No documents yet. Import a PDF or EPUB to start reading.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</p>
      )}
      <ul className="space-y-3">
        {documents.map((document) => {
          const lastOpened = formatLastOpened(document.lastOpenedAt);
          return (
            <li
              className="rounded-xl border border-zinc-200 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              key={document.id}
            >
              {renaming === document.id ? (
                <form
                  className="flex flex-wrap items-center gap-2 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(document.id);
                  }}
                >
                  <input
                    aria-label="Title"
                    autoFocus
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-zinc-900"
                    id={`rename-${document.id}`}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    value={draftTitle}
                  />
                  <button
                    className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    disabled={busy === document.id || !draftTitle.trim()}
                    type="submit"
                  >
                    Save
                  </button>
                  <button
                    className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
                    onClick={() => setRenaming(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <a className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1" href={`/documents/${document.id}`}>
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{document.title}</span>
                      <span className="shrink-0 text-sm uppercase text-zinc-500">{document.format}</span>
                    </span>
                    {lastOpened && (
                      <span className="text-sm text-zinc-500">Last opened {lastOpened}</span>
                    )}
                  </a>
                  <button
                    aria-label={`Rename ${document.title}`}
                    className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                    onClick={() => {
                      setRenaming(document.id);
                      setDraftTitle(document.title);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    aria-label={`Remove ${document.title}`}
                    className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                    disabled={busy === document.id}
                    onClick={() => void remove(document.id, document.title)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
