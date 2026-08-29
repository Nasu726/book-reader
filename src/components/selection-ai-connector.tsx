"use client";

import { useState, type ReactNode } from "react";

import { AiAnswerPanel } from "./ai-answer-panel";
import { useAiActions } from "./use-ai-actions";
import { AppShell } from "./app-shell";
import { SecondaryTabs, type SecondaryTab } from "./secondary-tabs";
import { SelectionActions } from "./selection-actions";
import { DocumentReader } from "./document-reader";
import { DocumentNotes } from "./document-notes";
import { useDocumentNote } from "./use-document-note";
import Link from "next/link";
import { DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "@/core/highlights/colors";
import type { DocumentSelection } from "@/core/selection/capture";

type SelectionAiConnectorProps = {
  documentId: string;
  documentFormat: "epub" |"pdf";
  documentTitle: string;
  documentSourceFilename?: string;
  /** Sign-out control, built on the server because only it knows how. */
  account?: ReactNode;
  initialHighlights: readonly {
    id: string;
    note?: string;
    selectedText: string;
    /** Needed to draw it: which page or chapter, and where in it. */
    location: string;
    color: HighlightColor;
  }[];
  initialVocabulary: readonly {
    id: string;
    meaning: string;
    sourceText: string;
    term: string;
  }[];
};

/** Matches the swatches in the selection menu, so the list reads as the same thing. */
const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-emerald-300",
  blue: "bg-blue-300",
  pink: "bg-pink-300",
};

export function SelectionAiConnector({
  documentId,
  documentFormat,
  documentTitle,
  documentSourceFilename,
  account,
  initialHighlights,
  initialVocabulary,
}: SelectionAiConnectorProps) {
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [sheetSignal, setSheetSignal] = useState(0);
  const [tab, setTab] = useState<SecondaryTab>("ai");
  const [highlightState, setHighlightState] = useState<"idle" |"saved" |"error">("idle");
  const [highlights, setHighlights] = useState(() => [...initialHighlights]);
  const [vocabulary, setVocabulary] = useState(() => [...initialVocabulary]);
  const [meaning, setMeaning] = useState("");
  // What the reader is looking at, so a question with nothing selected still
  // has the page to stand on.
  const [visibleText, setVisibleText] = useState("");
  const conversation = useAiActions({ documentExcerpt: visibleText, documentId, selection });
  const note = useDocumentNote(documentId);
  const [vocabularyState, setVocabularyState] = useState<"idle" |"saved" |"error">("idle");

  async function deleteVocabularyEntry(entryId: string) {
    try {
      const response = await fetch(`/api/documents/${documentId}/vocabulary/${entryId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setVocabulary((current) => current.filter((entry) => entry.id !== entryId));
    } catch {
      setVocabularyState("error");
    }
  }

  async function saveVocabularyEntry() {
    if (!selection) return;
    try {
      const response = await fetch(`/api/documents/${documentId}/vocabulary`, {
        body: JSON.stringify({
          format: selection.format,
          location: selection.location,
          meaning,
          selectedText: selection.text,
          term: selection.text.split(/\s+/).slice(0, 8).join(" "),
        }),
        headers: {"content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { entry?: { id: string } };
      if (!response.ok || !payload.entry) throw new Error("Save failed.");
      setVocabulary((current) => [...current, {
        id: payload.entry!.id,
        meaning,
        sourceText: selection.text,
        term: selection.text.split(/\s+/).slice(0, 8).join(" "),
      }]);
      setMeaning("");
      setVocabularyState("saved");
      window.setTimeout(() => setVocabularyState((current) => current === "saved" ? "idle" : current), 5000);
    } catch {
      setVocabularyState("error");
    }
  }

  async function deleteHighlight(highlightId: string) {
    try {
      const response = await fetch(
        `/api/documents/${documentId}/highlights/${highlightId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Delete failed.");
      setHighlights((current) => current.filter((item) => item.id !== highlightId));
    } catch {
      setHighlightState("error");
    }
  }

  async function handleHighlightCreated(
    captured: DocumentSelection,
    color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR,
  ) {
    try {
      const response = await fetch(`/api/documents/${documentId}/highlights`, {
        body: JSON.stringify({
          color,
          format: captured.format,
          location: captured.location,
          selectedText: captured.text,
        }),
        headers: {"content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { highlight?: { id: string } };
      if (!response.ok || !payload.highlight) throw new Error("Save failed.");
      const savedHighlight = payload.highlight;
      setHighlights((current) => [...current, {
        color,
        id: savedHighlight.id,
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
      account={account}
      openSecondarySignal={sheetSignal}
      showTextSize={documentFormat === "epub"}
      title={
        <div className="min-w-0">
          <Link className="text-sm text-ink-quiet hover:underline" href="/">
            ← Library
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">{documentTitle}</h1>
        </div>
      }
      reader={
        <>
          {/* The actions, offered against the passage itself. */}
          <SelectionActions
            onAction={(action) => {
              // Started straight from the click. Routing it through a prop and
              // an effect turned a user event into a state change, and made the
              // same action twice in a row look like no change at all.
              void conversation.send(action);
              // The answer has somewhere to arrive: the AI tab, and on a phone
              // the sheet that holds it.
              setTab("ai");
              setSheetSignal((current) => current + 1);
            }}
            onHighlight={(color) => {
              if (selection) void handleHighlightCreated(selection, color);
            }}
            selection={selection}
          />
          <DocumentReader
            documentId={documentId}
            documentSourceFilename={documentSourceFilename}
            documentTitle={documentTitle}
            format={documentFormat}
            highlights={highlights}
            onSelectionChange={(captured) => setSelection(captured)}
            onVisibleTextChange={setVisibleText}
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
            ai: <AiAnswerPanel conversation={conversation} onSaveToNotes={note.append} />,
            highlights: <>
          {/* No box and no heading: the tab is already what reveals this, and
              a panel that repeats its own tab's name says nothing. */}
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
            </>,
            notes: <>
          <DocumentNotes note={note} />
          <section aria-label="Saved vocabulary" className="border-rule mt-6 space-y-2 border-t pt-4">
            <h2 className="text-xs tracking-wide uppercase">Vocabulary</h2>
            <p className="text-xs text-ink-quiet">
              {selection ? `Selected source: ${selection.text}` : "Select text first."}
            </p>
            <label className="block text-sm font-medium" htmlFor="vocabulary-meaning">Meaning</label>
            <textarea
              className="border-edge bg-field min-h-20 w-full rounded-lg border p-3 text-base"
              id="vocabulary-meaning"
              onChange={(event) => {
                setMeaning(event.target.value);
                setVocabularyState("idle");
              }}
              value={meaning}
            />
            {vocabularyState === "saved" && <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">Vocabulary saved.</p>}
            {vocabularyState === "error" && (
              <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">Vocabulary could not be saved or deleted.</div>
            )}
            <button
              className="min-h-11 w-full rounded-lg bg-ink px-4 font-medium text-white disabled:opacity-50"
              disabled={!selection || !meaning.trim()}
              onClick={() => void saveVocabularyEntry()}
              type="button"
            >
              Save vocabulary
            </button>
            {vocabulary.length > 0 && (
              <ul className="space-y-3 pt-2">
                {vocabulary.map((entry) => (
                  <li className="flex items-start justify-between gap-3" key={entry.id}>
                    <div>
                      <p className="font-medium">{entry.term}</p>
                      <p className="text-sm">{entry.meaning}</p>
                      <p className="mt-1 text-xs text-ink-quiet">Source: {entry.sourceText}</p>
                    </div>
                    <button
                      aria-label={`Delete vocabulary entry: ${entry.term}`}
                      className="border-edge min-h-9 shrink-0 rounded-lg border px-2 text-xs"
                      onClick={() => void deleteVocabularyEntry(entry.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
            </>,
          }}
        />
      }
    />
  );
}
