"use client";

import { useCallback, useEffect, useState } from "react";

import { PdfRenderer } from "./pdf-renderer";
import { captureEpubSelection, type DocumentSelection } from "@/core/selection/capture";

type DocumentReaderProps = {
  documentId: string;
  format: "epub" | "pdf";
  onSelectionChange?: (selection: DocumentSelection | null) => void;
};

type ParsedEpub = {
  title?: string;
  sections: readonly {
    id: string;
    title?: string;
    content: string;
  }[];
};

function useDocumentProgress(documentId: string) {
  const [initialLocation, setInitialLocation] = useState<string | null | undefined>();
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/documents/${documentId}/progress`, { cache: "no-store" });
        if (!response.ok) throw new Error("Progress unavailable.");
        const payload = (await response.json()) as { location: string | null };
        if (!cancelled) setInitialLocation(payload.location);
      } catch {
        if (!cancelled) setInitialLocation(null);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [documentId]);

  const save = useCallback(async (location: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/progress`, {
        body: JSON.stringify({ location }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Save failed.");
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [documentId]);

  return { initialLocation, saveError, save };
}

export function DocumentReader({
  documentId,
  format,
  onSelectionChange,
}: DocumentReaderProps) {
  const [source, setSource] = useState<string | null>(null);
  const [epub, setEpub] = useState<ParsedEpub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedSelection, setCapturedSelection] = useState<DocumentSelection | null>(null);
  const progress = useDocumentProgress(documentId);
  const initialLocation = progress.initialLocation;
  const [sectionIndex, setSectionIndex] = useState(() => {
    if (typeof initialLocation !== "string") return 0;
    try {
      const parsed = JSON.parse(initialLocation) as { sectionId?: string; version?: number };
      return parsed.version === 1 && typeof parsed.sectionId === "string"
        ? Math.max(0, Number(parsed.sectionId.replace(/^section-/, "")) || 0)
        : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    let cancelled = false;
    async function open() {
      try {
        const response = await fetch(`/api/documents/${documentId}/source`, { cache: "no-store" });
        if (!response.ok) throw new Error("The document could not be opened.");
        const payload = (await response.json()) as { data: string };
        if (!cancelled) setSource(payload.data);
      } catch {
        if (!cancelled) setError("The document could not be opened.");
      }
    }
    void open();
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    if (format !== "epub") return;
    let cancelled = false;
    async function parse() {
      try {
        const response = await fetch(`/api/documents/${documentId}/parse`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (!cancelled) setEpub(payload as ParsedEpub);
      } catch {
        if (!cancelled) setError("The document could not be opened.");
      }
    }
    void parse();
    return () => { cancelled = true; };
  }, [documentId, format]);

  useEffect(() => {
    if (format !== "epub") return;
    function capture() {
      const selection = window.getSelection();
      if (!selection) return;
      const captured = captureEpubSelection(selection);
      setCapturedSelection(captured);
      onSelectionChange?.(captured);
    }
    document.addEventListener("mouseup", capture);
    document.addEventListener("touchend", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("touchend", capture);
    };
  }, [format, onSelectionChange]);

  useEffect(() => {
    if (format === "pdf" || !epub?.sections[sectionIndex]) return;
    void progress.save(JSON.stringify({
      version: 1,
      sectionId: epub.sections[sectionIndex].id,
    }));
  }, [epub, format, progress, sectionIndex]);

  if (error) return <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</div>;
  if (format === "epub") {
    if (!epub) return <p aria-live="polite">Opening…</p>;
    const section = epub.sections[sectionIndex];
    if (!section) return <div role="alert">This EPUB has no readable sections.</div>;
    return (
      <section aria-label="EPUB reader" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700" disabled={sectionIndex === 0} onClick={() => setSectionIndex(sectionIndex - 1)} type="button">Previous</button>
          <span className="text-sm">{sectionIndex + 1} / {epub.sections.length}</span>
          <button className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700" disabled={sectionIndex >= epub.sections.length - 1} onClick={() => setSectionIndex(sectionIndex + 1)} type="button">Next</button>
        </div>
        <article className="max-w-prose whitespace-pre-wrap rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-reader-section={section.id}>
          {section.title && <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>}
          {section.content}
        </article>
        {progress.saveError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 p-3 text-sm" role="alert">
            <span>Reading position could not be saved.</span>
            <button className="min-h-10 rounded bg-zinc-900 px-3 text-white" onClick={() => void progress.save(JSON.stringify({ version: 1, sectionId: section.id }))} type="button">Retry</button>
          </div>
        )}
        <div aria-label="EPUB selection preview" className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {capturedSelection?.text || "Select EPUB text to prepare it for AI actions."}
        </div>
      </section>
    );
  }
  if (!source) return <p aria-live="polite">Opening…</p>;
  if (format === "pdf") {
    return (
      <PdfRenderer
        initialLocation={initialLocation}
        onSelectionChange={(selection) => {
          setCapturedSelection(selection);
          onSelectionChange?.(selection);
        }}
        onLocationChange={(location) => void progress.save(location)}
        source={source}
      />
    );
  }
  return <div aria-label="EPUB reader">EPUB reader is not connected yet.</div>;
}
