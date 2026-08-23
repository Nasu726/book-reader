"use client";

import { useState } from "react";

import { AiAnswerPanel } from "./ai-answer-panel";
import { AppShell } from "./app-shell";
import { DocumentReader } from "./document-reader";
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
};

export function SelectionAiConnector({
  documentId,
  documentFormat,
  documentTitle,
  initialHighlights,
}: SelectionAiConnectorProps) {
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [highlightState, setHighlightState] = useState<"idle" | "saved" | "error">("idle");
  const [highlights, setHighlights] = useState(() => [...initialHighlights]);

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

  function handleHighlightCreated() {
    setHighlightState("saved");
    window.setTimeout(() => setHighlightState("idle"), 2400);
  }

  function handleHighlightError() {
    setHighlightState("error");
  }

  return (
    <AppShell
      reader={
        <>
          <Link className="inline-block text-sm" href="/">Back to library</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{documentTitle}</h1>
          <DocumentReader
            documentId={documentId}
            format={documentFormat}
            onHighlightCreated={handleHighlightCreated}
            onHighlightError={handleHighlightError}
            onSelectionChange={(captured) => setSelection(captured)}
          />
          <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">
            {highlightState === "saved"
              ? "Highlight saved."
              : highlightState === "error"
                ? "Highlight could not be saved."
                : ""}
          </p>
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
      secondary={<AiAnswerPanel selection={selection} />}
    />
  );
}
