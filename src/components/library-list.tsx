import { useState } from "react";

import { removeDocument, type StoredDocument, updateDocument } from "@/storage/documents";
import { routeTo } from "@/router";

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

export function LibraryList({
  documents,
  onChange,
}: {
  documents: readonly StoredDocument[];
  /** Called after a rename or a removal, so the list can be read again. */
  onChange: () => void;
}) {
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
      await updateDocument(id, { title });
      setRenaming(null);
      onChange();
    } catch {
      setError("The document could not be renamed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, title: string) {
    // The file, not the notes: what was marked and written is in the vault
    // and stays there. This only frees the bytes on this device.
    if (!window.confirm(`Remove “${title}” from this device? Your notes are kept.`)) {
      return;
    }
    setBusy(id);
    setError(null);
    try {
      await removeDocument(id);
      onChange();
    } catch {
      setError("The document could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  if (documents.length === 0) {
    return (
      <p className="max-w-prose text-ink-quiet">
        Nothing on this device yet. Open a PDF or EPUB to start reading.
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
          const lastOpened = formatLastOpened(document.openedAt);
          return (
            <li
              className="border-rule hover:border-ink-quiet rounded-xl border transition-colors duration-(--fast)"
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
                    className="border-edge bg-field min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base"
                    id={`rename-${document.id}`}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    value={draftTitle}
                  />
                  <button
                    className="min-h-11 rounded-lg bg-ink px-4 text-sm font-medium text-white"
                    disabled={busy === document.id || !draftTitle.trim()}
                    type="submit"
                  >
                    Save
                  </button>
                  <button
                    className="border-edge min-h-11 rounded-lg border px-4 text-sm"
                    onClick={() => setRenaming(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{document.title}</span>
                      <span className="shrink-0 text-sm uppercase text-ink-quiet">{document.format}</span>
                    </span>
                    {lastOpened && (
                      <span className="block text-sm text-ink-quiet">Last opened {lastOpened}</span>
                    )}
                  </div>
                  {/* An explicit control, because a clickable card gives no sign
                      that the whole row is the button. */}
                  <a
                    className="flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white"
                    href={routeTo({ id: document.id, screen: "read" })}
                  >
                    Read
                  </a>
                  <button
                    aria-label={`Rename ${document.title}`}
                    className="border-edge min-h-11 rounded-lg border px-3 text-sm"
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
                    className="border-edge min-h-11 rounded-lg border px-3 text-sm"
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
