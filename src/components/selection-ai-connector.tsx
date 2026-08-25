"use client";

import { useState } from "react";

import { AiAnswerPanel } from "./ai-answer-panel";
import { AppShell } from "./app-shell";
import { DocumentReader } from "./document-reader";
import { DocumentNotes } from "./document-notes";
import Link from "next/link";
import type { DocumentSelection } from "@/core/selection/capture";

type SelectionAiConnectorProps = {
  documentId: string;
  documentFormat: "epub" | "pdf";
  documentTitle: string;
  initialHighlights: readonly {
    id: string;
    note?: string;
    selectedText: string;
  }[];
  initialVocabulary: readonly {
    id: string;
    meaning: string;
    sourceText: string;
    term: string;
  }[];
};

export function SelectionAiConnector({
  documentId,
  documentFormat,
  documentTitle,
  initialHighlights,
  initialVocabulary,
}: SelectionAiConnectorProps) {
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [highlightState, setHighlightState] = useState<"idle" | "saved" | "error">("idle");
  const [highlights, setHighlights] = useState(() => [...initialHighlights]);
  const [vocabulary, setVocabulary] = useState(() => [...initialVocabulary]);
  const [meaning, setMeaning] = useState("");
  const [vocabularyState, setVocabularyState] = useState<"idle" | "saved" | "error">("idle");

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
        headers: { "content-type": "application/json" },
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

  async function handleHighlightCreated(captured: DocumentSelection) {
    try {
      const response = await fetch(`/api/documents/${documentId}/highlights`, {
        body: JSON.stringify({
          format: captured.format,
          location: captured.location,
          selectedText: captured.text,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { highlight?: { id: string } };
      if (!response.ok || !payload.highlight) throw new Error("Save failed.");
      const savedHighlight = payload.highlight;
      setHighlights((current) => [...current, { id: savedHighlight.id, selectedText: captured.text }]);
      setHighlightState("saved");
      window.setTimeout(() => setHighlightState("idle"), 5000);
    } catch {
      setHighlightState("error");
    }
  }

  return (
    <AppShell
      reader={
        <>
          <Link className="inline-block text-sm" href="/">Back to library</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{documentTitle}</h1>
          <DocumentReader
            documentId={documentId}
            documentTitle={documentTitle}
            format={documentFormat}
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
          <section aria-label="Saved highlights" className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Saved highlights</h2>
            {highlights.length === 0 ? (
              <p className="text-sm">No saved highlights.</p>
            ) : (
              <ul className="space-y-3">
                {highlights.map((highlight) => (
                  <li className="flex items-start justify-between gap-3" key={highlight.id}>
                    <div>
                      <p className="text-sm">{highlight.selectedText}</p>
                      {highlight.note && <p className="mt-1 text-xs">{highlight.note}</p>}
                    </div>
                    <button
                      aria-label={`Delete highlight: ${highlight.selectedText}`}
                      className="min-h-9 shrink-0 rounded-lg border border-zinc-300 px-2 text-xs dark:border-zinc-700"
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
        </>
      }
      secondary={
        <>
          <AiAnswerPanel
            documentId={documentId}
            onHighlightCreated={handleHighlightCreated}
            selection={selection}
          />
          <DocumentNotes documentId={documentId} />
          <section aria-label="Saved vocabulary" className="mt-6 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Save vocabulary</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {selection ? `Selected source: ${selection.text}` : "Select text first."}
            </p>
            <label className="block text-sm font-medium" htmlFor="vocabulary-meaning">Meaning</label>
            <textarea
              className="min-h-20 w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
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
              className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 font-medium text-white disabled:opacity-50"
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
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Source: {entry.sourceText}</p>
                    </div>
                    <button
                      aria-label={`Delete vocabulary entry: ${entry.term}`}
                      className="min-h-9 shrink-0 rounded-lg border border-zinc-300 px-2 text-xs dark:border-zinc-700"
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
        </>
      }
    />
  );
}
