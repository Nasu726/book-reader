"use client";

import { useCallback, useEffect, useState } from "react";

import { PdfRenderer } from "./pdf-renderer";
import { captureEpubSelection, type DocumentSelection } from "@/core/selection/capture";
import { usePageShortcuts } from "./use-page-shortcuts";

type DocumentReaderProps = {
  documentId: string;
  documentTitle?: string;
  /** The uploaded filename, used to tell an untouched title from a rename. */
  documentSourceFilename?: string;
  format: "epub" | "pdf";
  onSelectionChange?: (selection: DocumentSelection | null) => void;
};

type ParsedEpub = {
  title?: string;
  sections: readonly {
    id: string;
    title?: string;
    content: string;
    html?: string;
  }[];
};

/**
 * Replaces the filename the import route stored with the book's own title.
 *
 * Only when the stored title is still exactly the filename stem: a title the
 * reader chose by hand must survive every reopen.
 */
async function adoptBookTitle(
  documentId: string,
  bookTitle: string | undefined,
  currentTitle: string,
  sourceFilename: string | undefined,
): Promise<void> {
  const title = bookTitle?.trim();
  const untouched = sourceFilename?.replace(/\.(epub|pdf)$/i, "");
  if (!title || !untouched || currentTitle !== untouched || title === currentTitle) {
    return;
  }
  try {
    await fetch(`/api/documents/${documentId}`, {
      body: JSON.stringify({ title }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
  } catch {
    // The reader still works with the filename as its title.
  }
}

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
  documentTitle = "",
  documentSourceFilename,
  format,
  onSelectionChange,
}: DocumentReaderProps) {
  const [epub, setEpub] = useState<ParsedEpub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedSelection, setCapturedSelection] = useState<DocumentSelection | null>(null);
  const progress = useDocumentProgress(documentId);
  const initialLocation = progress.initialLocation;
  const initialSectionId = (() => {
    if (!initialLocation) return null;
    try {
      const parsed = JSON.parse(initialLocation) as { sectionId?: string; version?: number };
      return parsed.version === 1 && typeof parsed.sectionId === "string" ? parsed.sectionId : null;
    } catch {
      return null;
    }
  })();
  const [hasUserNavigated, setHasUserNavigated] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [restoredInitialLocation, setRestoredInitialLocation] = useState<string | null | undefined>(undefined);

  if (
    initialLocation !== undefined &&
    restoredInitialLocation !== initialLocation
  ) {
    setRestoredInitialLocation(initialLocation);
    if (!hasUserNavigated && epub) {
      const restoredSectionIndex = epub.sections.findIndex((section) => section.id === initialSectionId);
      if (restoredSectionIndex >= 0) setSectionIndex(restoredSectionIndex);
    }
  }

  if (
    format === "epub" &&
    epub &&
    !hasUserNavigated &&
    sectionIndex === 0 &&
    typeof initialLocation === "string" &&
    initialSectionId
  ) {
    const restoredSectionIndex = epub.sections.findIndex((section) => section.id === initialSectionId);
    if (restoredSectionIndex > 0) setSectionIndex(restoredSectionIndex);
  }

  // The renderer streams the bytes straight from this URL, so there is nothing
  // to fetch here; a missing document surfaces as the renderer's own error.
  const source = `/api/documents/${documentId}/source`;

  const sectionCount = epub?.sections.length ?? 0;
  function goToSection(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= sectionCount) return;
    setHasUserNavigated(true);
    setSectionIndex(nextIndex);
  }
  // PDF pages are turned by the PDF renderer's own shortcuts.
  usePageShortcuts({
    enabled: format === "epub" && sectionCount > 0,
    onNext: () => goToSection(sectionIndex + 1),
    onPrevious: () => goToSection(sectionIndex - 1),
  });

  useEffect(() => {
    if (format !== "epub") return;
    let cancelled = false;
    async function parse() {
      try {
        // Parsed here rather than on the server: a whole book does not fit in
        // a Cloudflare Worker's 10ms CPU budget, and the browser has to build
        // this DOM anyway to reflow the text.
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error("The document could not be opened.");
        const bytes = await response.arrayBuffer();
        const { parseEpubInBrowser } = await import("./epub-browser-parser");
        const parsed = await parseEpubInBrowser(bytes, documentTitle || "document.epub");
        if (cancelled) return;
        setEpub(parsed as ParsedEpub);
        void adoptBookTitle(documentId, parsed.title, documentTitle, documentSourceFilename);
      } catch {
        if (!cancelled) setError("The document could not be opened.");
      }
    }
    void parse();
    return () => { cancelled = true; };
  }, [documentId, documentSourceFilename, documentTitle, format, source]);

  useEffect(() => {
    if (format !== "epub") return;
    async function capture() {
      const selection = window.getSelection();
      if (!selection) return;
      const captured = captureEpubSelection(selection, document, documentTitle || document.title);
      setCapturedSelection(captured);
      onSelectionChange?.(captured);
    }
    document.addEventListener("mouseup", capture);
    document.addEventListener("touchend", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("touchend", capture);
    };
  }, [documentTitle, format, onSelectionChange]);

  useEffect(() => {
    if (format === "pdf" || !hasUserNavigated || !epub) return;
    const section = epub.sections[sectionIndex];
    if (!section) return;
    const timer = window.setTimeout(() => {
      void progress.save(JSON.stringify({
        version: 1,
        sectionId: epub.sections[sectionIndex].id,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [epub, format, hasUserNavigated, progress, sectionIndex]);

  if (error) return <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</div>;
  if (format === "epub") {
    if (!epub) return <p aria-live="polite">Opening…</p>;
    const section = epub.sections[sectionIndex];
    if (!section) return <div role="alert">This EPUB has no readable sections.</div>;
    return (
      <section aria-label="EPUB reader" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700" disabled={sectionIndex === 0} onClick={() => goToSection(sectionIndex - 1)} type="button">Previous</button>
          <span className="text-sm">{sectionIndex + 1} / {epub.sections.length}</span>
          <button className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700" disabled={sectionIndex >= epub.sections.length - 1} onClick={() => goToSection(sectionIndex + 1)} type="button">Next</button>
        </div>
        <article className="reader-prose max-w-prose rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-reader-section={section.id}>
          {/* The nav label is only shown when the chapter body carries no heading of its own. */}
          {section.title && !/<h[1-6]>/.test(section.html ?? "") && (
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
          )}
          {section.html
            ? <div dangerouslySetInnerHTML={{ __html: section.html }} />
            : <div className="whitespace-pre-wrap">{section.content}</div>}
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

  if (format === "pdf") {
    return (
      <PdfRenderer
        documentTitle={documentTitle}
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
