import { useCallback, useEffect, useRef, useState } from "react";

import { ContentsSelect } from "./contents-select";
import { PdfRenderer } from "./pdf-renderer";
import { captureEpubSelection, type DocumentSelection } from "@/core/selection/capture";
import { clearAllHighlights, paintHighlights, type PaintableHighlight } from "./highlight-paint";
import { usePageShortcuts } from "./use-page-shortcuts";
import { type StoredDocument, titleFromFilename, updateDocument } from "@/storage/documents";
import { getProgress, saveProgress } from "@/storage/progress";

type DocumentReaderProps = {
  document: StoredDocument;
  /** The file itself, from this device. */
  bytes: ArrayBuffer;
  /** Saved highlights, drawn onto the text as it renders. */
  highlights?: readonly PaintableHighlight[];
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
 * Replaces the filename the book was opened from with the book's own title.
 *
 * Only when the stored title is still exactly the filename stem: a title the
 * reader chose by hand must survive every reopen.
 */
async function adoptBookTitle(stored: StoredDocument, bookTitle: string | undefined): Promise<void> {
  const title = bookTitle?.trim();
  if (!title || stored.title !== titleFromFilename(stored.name) || title === stored.title) return;
  try {
    await updateDocument(stored.id, { title });
  } catch {
    // The reader still works with the filename as its title.
  }
}

function useDocumentProgress(documentId: string) {
  const [initialLocation, setInitialLocation] = useState<string | null | undefined>();
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getProgress(documentId)
      .then((location) => { if (!cancelled) setInitialLocation(location); })
      .catch(() => { if (!cancelled) setInitialLocation(null); });
    return () => { cancelled = true; };
  }, [documentId]);

  const save = useCallback(async (location: string) => {
    try {
      await saveProgress(documentId, location);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [documentId]);

  return { initialLocation, saveError, save };
}

export function DocumentReader({
  document: stored,
  bytes,
  highlights = [],
  onSelectionChange,
}: DocumentReaderProps) {
  const documentId = stored.id;
  const documentTitle = stored.title;
  const format = stored.format;
  const chapterRef = useRef<HTMLElement>(null);
  const readerRef = useRef<HTMLElement>(null);
  const [epub, setEpub] = useState<ParsedEpub | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const sectionCount = epub?.sections.length ?? 0;
  function goToSection(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= sectionCount) return;
    setHasUserNavigated(true);
    setSectionIndex(nextIndex);
  }
  // PDF pages are turned by the PDF renderer's own shortcuts.
  // Omitted at the ends so the key press does nothing rather than re-rendering
  // the section already showing.
  usePageShortcuts({
    enabled: format === "epub" && sectionCount > 0,
    onNext: sectionIndex < sectionCount - 1
      ? () => goToSection(sectionIndex + 1)
      : undefined,
    onPrevious: sectionIndex > 0 ? () => goToSection(sectionIndex - 1) : undefined,
  });

  useEffect(() => {
    if (format !== "epub") return;
    let cancelled = false;
    async function parse() {
      try {
        // Parsed here, in the browser, which has to build this DOM anyway to
        // reflow the text.
        const { parseEpubInBrowser } = await import("./epub-browser-parser");
        const parsed = await parseEpubInBrowser(bytes, stored.name || "document.epub");
        if (cancelled) return;
        setEpub(parsed as ParsedEpub);
        void adoptBookTitle(stored, parsed.title);
      } catch {
        if (!cancelled) setError("The document could not be opened.");
      }
    }
    void parse();
    return () => { cancelled = true; };
  }, [bytes, format, stored]);

  // Listened for on the book, not on the whole document.
  //
  // On `document`, every click in the pane beside the text also reported "no
  // selection", so choosing an action there threw away the passage it was
  // about. Scoped here, letting go of a passage is something the reader does in
  // the book — which is exactly when the composer should stop offering it.
  useEffect(() => {
    const reader = readerRef.current;
    if (format !== "epub" || !reader) return;
    function capture() {
      const selection = window.getSelection();
      if (!selection) return;
      // The book's own title once it is parsed, not the filename the import
      // stored: the rename reaches the server, but this prop is from before.
      onSelectionChange?.(captureEpubSelection(
        selection,
        document,
        epub?.title || documentTitle || document.title,
        epub?.sections[sectionIndex]?.title,
      ));
    }
    reader.addEventListener("mouseup", capture);
    reader.addEventListener("touchend", capture);
    return () => {
      reader.removeEventListener("mouseup", capture);
      reader.removeEventListener("touchend", capture);
    };
  }, [documentTitle, epub, format, onSelectionChange, sectionIndex]);

  const section = epub?.sections[sectionIndex];
  const sectionId = section?.id;
  useEffect(() => {
    const chapter = chapterRef.current;
    if (format !== "epub" || !chapter || !sectionId) return;
    paintHighlights(chapter, highlights, { format: "epub", sectionId });
  }, [format, highlights, sectionId]);

  // The registry outlives this component, so a document left open would keep
  // colouring text in the next one.
  useEffect(() => clearAllHighlights, []);

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
    if (!section) return <div role="alert">This EPUB has no readable sections.</div>;
    return (
      <section aria-label="EPUB reader" className="space-y-4" ref={readerRef}>
        <div className="flex items-center justify-between gap-2">
          <button className="border-edge min-h-11 shrink-0 rounded-lg border px-3 text-sm" disabled={sectionIndex === 0} onClick={() => goToSection(sectionIndex - 1)} type="button">Previous</button>
          {/* Takes what the buttons and the count leave, so a phone gets a
              narrower list rather than a count folded onto three lines. */}
          <ContentsSelect
            className="min-w-0 flex-1 sm:max-w-72"
            current={sectionIndex}
            entries={epub.sections.map((candidate, index) => ({ label: candidate.title || `Section ${index + 1}` }))}
            onPick={goToSection}
          />
          <span className="shrink-0 text-sm tabular-nums whitespace-nowrap">{sectionIndex + 1} / {epub.sections.length}</span>
          <button className="border-edge min-h-11 shrink-0 rounded-lg border px-3 text-sm" disabled={sectionIndex >= epub.sections.length - 1} onClick={() => goToSection(sectionIndex + 1)} type="button">Next</button>
        </div>
        <article className="reader-prose max-w-prose rounded-xl border border-rule p-4" data-reader-section={section.id} ref={chapterRef}>
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
            <button className="min-h-10 rounded bg-ink px-3 text-white" onClick={() => void progress.save(JSON.stringify({ version: 1, sectionId: section.id }))} type="button">Retry</button>
          </div>
        )}
      </section>
    );
  }

  if (format === "pdf") {
    // Waiting for the saved position means the first render already knows which
    // page to show, instead of starting at page 1 and correcting itself.
    if (initialLocation === undefined) return <p aria-live="polite">Opening…</p>;
    return (
      <PdfRenderer
        bytes={bytes}
        documentTitle={documentTitle}
        highlights={highlights}
        initialLocation={initialLocation}
        onSelectionChange={onSelectionChange}
        onLocationChange={(location) => void progress.save(location)}
      />
    );
  }
  return <div aria-label="EPUB reader">EPUB reader is not connected yet.</div>;
}
