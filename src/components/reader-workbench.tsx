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
import type { StoredDocument } from "@/storage/documents";
import { getNote, putNote, type StoredHighlight } from "@/storage/notes";

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
  const note = useDocumentNote(stored.id);
  // Reflowed text can be resized; a drawn page has zoom instead.
  const pdfView = useSyncExternalStore(subscribe, getStoredPdfView, serverPdfView);

  useEffect(() => {
    let cancelled = false;
    void getNote(stored.id).then((saved) => {
      if (!cancelled) setHighlights(saved.highlights);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [stored.id]);

  async function writeHighlights(next: readonly StoredHighlight[]) {
    const saved = await getNote(stored.id);
    await putNote({ ...saved, highlights: [...next] });
    setHighlights(next);
  }

  async function deleteHighlight(highlightId: string) {
    try {
      await writeHighlights(highlights.filter((item) => item.id !== highlightId));
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
      }]);
      setHighlightState("saved");
      window.setTimeout(() => setHighlightState("idle"), 5000);
    } catch {
      setHighlightState("error");
    }
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
                          <div>
                            <p className="text-sm">{highlight.selectedText}</p>
                            {highlight.note && <p className="mt-1 text-xs">{highlight.note}</p>}
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
            notes: <DocumentNotes note={note} />,
          }}
        />
      }
    />
  );
}
