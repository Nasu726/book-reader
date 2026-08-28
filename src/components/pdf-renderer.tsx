"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { capturePdfSelection, type DocumentSelection } from "@/core/selection/capture";
import { inferPaperStructure } from "@/core/documents/paper-structure";
import type { PaintableHighlight } from "./highlight-paint";
import { PdfPage, type PdfDocumentProxy } from "./pdf-page";
import { usePageShortcuts } from "./use-page-shortcuts";

GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${version}`;

/** Fit-to-width is 1; the range covers small print and large-format scans. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

type PdfRendererProps = {
  documentTitle?: string;
  /** Saved highlights, drawn onto each page as it is rendered. */
  highlights?: readonly PaintableHighlight[];
  source: string;
  initialLocation?: string | null;
  onLocationChange?: (location: string) => void;
  onSelectionChange?: (selection: DocumentSelection | null) => void;
};

function parsePage(location: string | null | undefined): number {
  try {
    if (!location) return 1;
    const parsed = JSON.parse(location) as { page?: unknown; version?: unknown };
    return parsed.version === 1 && Number.isInteger(parsed.page)
      ? Math.max(1, parsed.page as number)
      : 1;
  } catch {
    return 1;
  }
}

/**
 * A PDF as one scrolling column of pages.
 *
 * Pages used to be swapped one at a time into a single canvas. That made the
 * page fit the width of a phone and therefore too small to read, turned normal
 * reading into repeated button presses, and let one page's failed render leave
 * an error over a page that had drawn perfectly well. A column of pages is what
 * every other reader does, and it removes all three.
 */
export function PdfRenderer({
  documentTitle = "",
  highlights = [],
  initialLocation,
  onLocationChange,
  onSelectionChange,
  source,
}: PdfRendererProps) {
  type PdfLoadingTask = ReturnType<typeof getDocument>;

  const [document_, setDocument] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1.414);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(() => parsePage(initialLocation));
  const [capturedSelection, setCapturedSelection] = useState<DocumentSelection | null>(null);

  const columnRef = useRef<HTMLDivElement>(null);
  const pageTextRef = useRef(new Map<number, string>());
  const restoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let task: PdfLoadingTask | null = null;

    async function open() {
      try {
        const response = await fetch(source);
        const data = await response.arrayBuffer();
        task = getDocument({ data, useSystemFonts: true });
        const opened = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        const first = await opened.getPage(1);
        const size = first.getViewport({ scale: 1 });
        setAspectRatio(size.height / size.width);
        setPageCount(opened.numPages);
        setDocument(opened);
      } catch {
        if (!cancelled) setError("The PDF could not be opened.");
      }
    }

    void open();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [source]);

  const scrollToPage = useCallback((target: number) => {
    const column = columnRef.current;
    if (!column) return;
    const bounded = Math.min(pageCount || 1, Math.max(1, target));
    column
      .querySelector(`[data-page-number="${bounded}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [pageCount]);

  // Put the reader back where they were, then start watching where they go.
  //
  // Both in one effect and in that order: the observer reports whatever is on
  // screen, so if it started first it would immediately overwrite the restored
  // page with page 1. The scroll is instant rather than smooth for the same
  // reason — a scroll still in flight is a scroll the observer misreads.
  useEffect(() => {
    const column = columnRef.current;
    if (!column || !pageCount) return;

    if (!restoredRef.current) {
      restoredRef.current = true;
      const page = parsePage(initialLocation);
      if (page > 1) {
        column
          .querySelector(`[data-page-number="${page}"]`)
          ?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    }

    // The callback only reports pages whose visibility changed, so the set of
    // everything currently on screen is kept here. Choosing the topmost from a
    // single callback's entries meant scrolling back to page 1 left the number
    // reading 2, because only page 2's entry had changed.
    const onScreen = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number(entry.target.getAttribute("data-page-number"));
          if (!Number.isInteger(page)) continue;
          if (entry.isIntersecting) {
            onScreen.set(page, entry.boundingClientRect.top);
          } else {
            onScreen.delete(page);
          }
        }
        const topmost = [...onScreen.entries()].sort((a, b) => a[1] - b[1])[0];
        if (topmost) setCurrentPage(topmost[0]);
      },
      { root: column.closest("[data-reader-scroll]"), threshold: 0.01 },
    );
    for (const page of column.querySelectorAll("[data-page-number]")) {
      observer.observe(page);
    }
    return () => observer.disconnect();
  }, [initialLocation, pageCount]);

  // Saved only once the page actually changes. Reporting the restored page
  // straight after mount wrote a row that said nothing new, and a test waiting
  // for"the progress request" could catch that one instead of the real move.
  // It also spends a write against D1's daily budget for no reason.
  const savedPageRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pageCount || !onLocationChange) return;
    if (savedPageRef.current === null) {
      savedPageRef.current = currentPage;
      return;
    }
    if (savedPageRef.current === currentPage) return;
    savedPageRef.current = currentPage;
    onLocationChange(JSON.stringify({ page: currentPage, version: 1 }));
  }, [currentPage, onLocationChange, pageCount]);

  // Nothing happens at the ends. Clamping inside scrollToPage still scrolled to
  // the page already showing, which costs a smooth scroll and a re-render for a
  // key press that should have done nothing.
  usePageShortcuts({
    enabled: pageCount > 0,
    onNext: currentPage < pageCount ? () => scrollToPage(currentPage + 1) : undefined,
    onPrevious: currentPage > 1 ? () => scrollToPage(currentPage - 1) : undefined,
  });

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    const updateSelection = () => {
      const selection = window.getSelection();
      const pageText = pageTextRef.current.get(currentPage) ?? "";
      let paperStructure: ReturnType<typeof inferPaperStructure> | undefined;
      try {
        paperStructure = pageText.trim() ? inferPaperStructure(pageText) : undefined;
      } catch {
        paperStructure = undefined;
      }
      const captured = selection
        ? capturePdfSelection(selection, currentPage, { documentTitle, pageText, paperStructure })
        : null;
      setCapturedSelection(captured);
      onSelectionChange?.(captured);
    };

    column.addEventListener("mouseup", updateSelection);
    column.addEventListener("touchend", updateSelection);
    return () => {
      column.removeEventListener("mouseup", updateSelection);
      column.removeEventListener("touchend", updateSelection);
    };
  }, [currentPage, documentTitle, onSelectionChange]);

  const rememberPageText = useCallback((page: number, text: string) => {
    pageTextRef.current.set(page, text);
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</div>
    );
  }

  return (
    <section aria-label="PDF reader">
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 border-b border-rule bg-paper/90 px-3 py-2 backdrop-blur sm:border-0 sm:px-0 /90">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-quiet">Page</span>
          <input
            aria-label="Page number"
            className="min-h-11 w-16 rounded-lg border border-rule px-2 text-center tabular-nums"
            max={pageCount || 1}
            min={1}
            onChange={(event) => {
              const page = Number(event.target.value);
              if (Number.isInteger(page) && page >= 1 && page <= pageCount) scrollToPage(page);
            }}
            type="number"
            value={currentPage}
          />
          <span aria-live="polite" className="text-ink-quiet tabular-nums">
            of {pageCount ||"…"}
          </span>
        </label>
        <div aria-label="Page zoom" className="ml-auto flex items-center gap-1" role="group">
          <button
            aria-label="Zoom out"
            className="min-h-11 rounded-lg border border-rule px-3 text-sm"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((current) => Math.max(MIN_ZOOM, Math.round((current - 0.25) * 100) / 100))}
            type="button"
          >
            −
          </button>
          <button
            aria-label={`Zoom, currently ${Math.round(zoom * 100)} percent. Reset to fit width`}
            className="min-h-11 rounded-lg border border-rule px-2 text-sm tabular-nums"
            onClick={() => setZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            className="min-h-11 rounded-lg border border-rule px-3 text-sm"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((current) => Math.min(MAX_ZOOM, Math.round((current + 0.25) * 100) / 100))}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6" ref={columnRef}>
        {document_ && pageCount > 0
          ? Array.from({ length: pageCount }, (_, index) => (
            <PdfPage
              aspectRatio={aspectRatio}
              document={document_}
              highlights={highlights}
              key={index + 1}
              onTextExtracted={rememberPageText}
              pageNumber={index + 1}
              zoom={zoom}
            />
          ))
          : <p aria-live="polite" className="text-sm">Opening…</p>}
      </div>

      <section aria-label="PDF selection preview" className="mx-3 mt-4 rounded-xl border border-rule p-3 text-sm sm:mx-0">
        {capturedSelection?.text ||"Select PDF text to prepare it for AI actions."}
      </section>
    </section>
  );
}
