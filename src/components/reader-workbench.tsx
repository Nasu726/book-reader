import { useEffect, useState, useSyncExternalStore } from "react";

import { AppShell } from "./app-shell";
import { SecondaryTabs, type SecondaryTab } from "./secondary-tabs";
import { SelectionActions } from "./selection-actions";
import { DocumentReader } from "./document-reader";
import { DocumentNotes } from "./document-notes";
import { useDocumentNote } from "./use-document-note";
import { getStoredPdfView, serverPdfView, subscribe } from "./reader-preferences";
import type { HighlightColor } from "@/core/highlights/colors";
import type { DocumentSelection } from "@/core/selection/capture";
import { renderNote } from "@/notes/format";
import type { StoredDocument } from "@/storage/documents";
import { getNote, noteStateOf, putNote, type StoredHighlight } from "@/storage/notes";
import { flush, useSyncStatus } from "@/sync/sync";

/** Where a passage is, for a person: the page, or the chapter. */
function whereOf(captured: DocumentSelection): string | undefined {
  if (captured.format === "pdf") {
    try {
      const page = (JSON.parse(captured.location) as { page?: unknown }).page;
      if (typeof page === "number") return `p.${page}`;
    } catch {
      return undefined;
    }
  }
  return captured.sectionTitle ? `§${captured.sectionTitle}` : undefined;
}

/** Matches the swatches in the selection menu, so the list reads as the same thing. */
const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-emerald-300",
  blue: "bg-blue-300",
  pink: "bg-pink-300",
};

/**
 * The reading screen: the book, the menu against a selection, and the pane
 * of what the reader marked and wrote.
 *
 * Marks and the memo are read from and written to this device's store. What
 * reaches the vault is the note rendered from them (PIVOT-004/005).
 */
export function ReaderWorkbench({
  document: stored,
  bytes,
}: {
  document: StoredDocument;
  bytes: ArrayBuffer;
}) {
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [tab, setTab] = useState<SecondaryTab>("highlights");
  const [highlightState, setHighlightState] = useState<"idle" | "saved" | "error">("idle");
  const [highlights, setHighlights] = useState<readonly StoredHighlight[]>([]);
  const [finished, setFinished] = useState(false);
  // Which mark's note is being written, and what it says so far.
  const [noteEditing, setNoteEditing] = useState<{ id: string; draft: string } | null>(null);
  const note = useDocumentNote(stored.id);
  // Reflowed text can be resized; a drawn page has zoom instead.
  const pdfView = useSyncExternalStore(subscribe, getStoredPdfView, serverPdfView);

  // Opening a document asks the vault for it, so marks made on another
  // device are here before the first page is read.
  useEffect(() => { void flush({ include: stored.id }); }, [stored.id]);

  // Read again after every sync: a mark made on another device arrives
  // through the vault, and the list should show it without a reload.
  const sync = useSyncStatus();
  const syncedAt = sync.state === "synced" ? sync.at : null;
  useEffect(() => {
    let cancelled = false;
    void getNote(stored.id).then((saved) => {
      if (cancelled) return;
      setHighlights(saved.highlights);
      setFinished(saved.status === "done");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [stored.id, syncedAt]);

  async function writeHighlights(next: readonly StoredHighlight[]) {
    const saved = await getNote(stored.id);
    await putNote({ ...saved, highlights: [...next] });
    setHighlights(next);
  }

  async function deleteHighlight(highlightId: string) {
    try {
      // A tombstone as well as a removal, so the vault's copy of the mark
      // does not come back at the next sync.
      const saved = await getNote(stored.id);
      const next = highlights.filter((item) => item.id !== highlightId);
      await putNote({ ...saved, deleted: [...(saved.deleted ?? []), highlightId], highlights: [...next] });
      setHighlights(next);
    } catch {
      setHighlightState("error");
    }
  }

  async function addHighlight(captured: DocumentSelection, color: HighlightColor) {
    try {
      await writeHighlights([...highlights, {
        color,
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID().slice(0, 8),
        location: captured.location,
        selectedText: captured.text,
        ...(whereOf(captured) ? { where: whereOf(captured) } : {}),
      }]);
      setHighlightState("saved");
      window.setTimeout(() => setHighlightState("idle"), 5000);
    } catch {
      setHighlightState("error");
    }
  }

  async function saveHighlightNote(highlightId: string, text: string) {
    const trimmed = text.trim();
    try {
      await writeHighlights(highlights.map((item) => item.id !== highlightId
        ? item
        : trimmed ? { ...item, note: trimmed } : (({ note: _dropped, ...rest }) => rest)(item)));
      setNoteEditing(null);
    } catch {
      setHighlightState("error");
    }
  }

  async function markFinished(done: boolean) {
    setFinished(done);
    try {
      const saved = await getNote(stored.id);
      await putNote({ ...saved, editedAt: new Date().toISOString(), status: done ? "done" : "reading" });
    } catch {
      setFinished(!done);
    }
  }

  async function renderMarkdown(): Promise<string> {
    const saved = await getNote(stored.id);
    return renderNote(noteStateOf(stored, saved), saved.outside ?? { after: "\n", before: "" });
  }

  return (
    <AppShell
      showTextSize={stored.format === "epub" || pdfView === "text"}
      title={
        <div className="min-w-0">
          <a className="text-sm text-ink-quiet hover:underline" href="/">
            ← Library
          </a>
          <h1 className="truncate text-lg font-semibold tracking-tight">{stored.title}</h1>
        </div>
      }
      reader={
        <>
          {/* Copying and the colours, offered against the passage itself. */}
          <SelectionActions
            onHighlight={(color) => {
              if (selection) void addHighlight(selection, color);
            }}
            selection={selection}
          />
          <DocumentReader
            bytes={bytes}
            document={stored}
            highlights={highlights}
            onSelectionChange={(captured) => setSelection(captured)}
          />
          {highlightState !== "idle" && (
            <p
              aria-live="polite"
              className={highlightState === "saved" ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}
            >
              {highlightState === "saved" ? "Highlight saved." : "Highlight could not be saved."}
            </p>
          )}
        </>
      }
      secondary={
        <SecondaryTabs
          active={tab}
          onChange={setTab}
          panels={{
            highlights: (
              // No box and no heading: the tab is already what reveals this,
              // and a panel that repeats its own tab's name says nothing.
              <section aria-label="Saved highlights">
                <p className="text-ink-quiet text-xs">
                  {highlights.length === 0
                    ? "Passages you mark stay with this document."
                    : `${highlights.length} marked in this document.`}
                </p>
                {highlights.length === 0 ? (
                  <p className="mt-2 text-sm">
                    Select a passage in the book, then choose a colour.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {highlights.map((highlight) => (
                      <li className="flex items-start justify-between gap-3" key={highlight.id}>
                        <div className="flex items-start gap-2">
                          <span
                            aria-hidden
                            className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${SWATCH_CLASS[highlight.color]}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">{highlight.selectedText}</p>
                            {highlight.where && <p className="text-ink-quiet mt-0.5 text-xs">{highlight.where}</p>}
                            {noteEditing?.id === highlight.id ? (
                              <form
                                className="mt-2 space-y-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void saveHighlightNote(highlight.id, noteEditing.draft);
                                }}
                              >
                                <label className="sr-only" htmlFor={`highlight-note-${highlight.id}`}>Note on this highlight</label>
                                <textarea
                                  autoFocus
                                  className="border-edge bg-field min-h-20 w-full rounded-lg border p-2 text-base"
                                  id={`highlight-note-${highlight.id}`}
                                  onChange={(event) => setNoteEditing({ draft: event.target.value, id: highlight.id })}
                                  value={noteEditing.draft}
                                />
                                <div className="flex gap-2">
                                  <button className="min-h-9 rounded-lg bg-ink px-3 text-xs font-medium text-white" type="submit">
                                    Save note
                                  </button>
                                  <button
                                    className="border-edge min-h-9 rounded-lg border px-3 text-xs"
                                    onClick={() => setNoteEditing(null)}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                {highlight.note && <p className="mt-1 text-sm whitespace-pre-wrap">{highlight.note}</p>}
                                {/* A word and its meaning, a passage and a thought: the
                                    note on a mark is where the vocabulary went. */}
                                <button
                                  aria-label={`${highlight.note ? "Edit" : "Add"} note: ${highlight.selectedText}`}
                                  className="text-ink-quiet hover:text-ink mt-1 min-h-9 text-xs tracking-wide uppercase transition-colors duration-(--fast)"
                                  onClick={() => setNoteEditing({ draft: highlight.note ?? "", id: highlight.id })}
                                  type="button"
                                >
                                  {highlight.note ? "Edit note" : "Add note"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          aria-label={`Delete highlight: ${highlight.selectedText}`}
                          className="border-edge min-h-9 shrink-0 rounded-lg border px-2 text-xs"
                          onClick={() => void deleteHighlight(highlight.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ),
            notes: (
              <DocumentNotes
                documentId={stored.id}
                finished={finished}
                note={note}
                onFinishedChange={(done) => void markFinished(done)}
                renderMarkdown={renderMarkdown}
              />
            ),
          }}
        />
      }
    />
  );
}
