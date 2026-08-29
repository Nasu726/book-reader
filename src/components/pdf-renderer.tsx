"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { installStreamAsyncIterator } from "./stream-async-iterator";

import { capturePdfSelection, type DocumentSelection } from "@/core/selection/capture";
import { inferPaperStructure } from "@/core/documents/paper-structure";
import type { PaintableHighlight } from "./highlight-paint";
import { PdfPage, type PdfDocumentProxy } from "./pdf-page";
import { PdfTextPage } from "./pdf-text-page";
import { getStoredPdfView, serverPdfView, setStoredPdfView, subscribe } from "./reader-preferences";
import { usePageShortcuts } from "./use-page-shortcuts";

GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${version}`;

// Before pdf.js reads anything: it iterates a stream to collect a page's text,
// and Safari has no async iterator on ReadableStream to iterate it with.
installStreamAsyncIterator();

/** Which page a selection is on, from where the selection actually is. */
function pageOfSelection(selection: Selection | null): number | null {
  const node = selection?.anchorNode;
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  const page = Number(element?.closest("[data-page-number]")?.getAttribute("data-page-number"));
  return Number.isInteger(page) ? page : null;
}

/**
 * The toolbar host never changes once the shell has rendered, so there is
 * nothing to subscribe to — this reads a stable node from outside React, which
 * is what useSyncExternalStore is for.
 */
const subscribeToNothing = () => () => {};

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
  /** The text of the page in view, for questions that have nothing selected. */
  onVisibleTextChange?: (text: string) => void;
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
  onVisibleTextChange,
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
  const [containerWidth, setContainerWidth] = useState(0);

  /**
   * The strip above the reading pane, which this reader fills.
   *
   * Rendered through it rather than inside the pane, because the pane scrolls
   * in both directions once a page is zoomed and a toolbar that scrolls with
   * the book is a toolbar you have to go and find. Found after mounting, since
   * the shell renders before what it contains.
   */
  // Pages as printed, or the text taken off them. A preference, so the choice
  // survives closing the book.
  const view = useSyncExternalStore(subscribe, getStoredPdfView, serverPdfView);

  const toolbarHost = useSyncExternalStore(
    subscribeToNothing,
    () => document.querySelector("[data-reader-toolbar]"),
    () => null,
  );
  const pageTextRef = useRef(new Map<number, string>());
  const restoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let task: PdfLoadingTask | null = null;

    /**
     * Opens the document, by range if the connection allows it.
     *
     * Ranges are what let a phone open a large book at all: handing pdf.js the
     * whole file as one buffer is how iOS ends up reloading the tab. But a
     * range request has more that can go wrong than a plain download — a proxy
     * that strips the header, a runtime that will not answer 206 — and when it
     * does go wrong every page fails to draw and offers a Try again that fails
     * the same way. So the whole file is the fallback, not the default.
     */
    async function openBy(mode: "ranges" | "whole"): Promise<PdfDocumentProxy> {
      task = mode === "ranges"
        ? getDocument({
          disableAutoFetch: true,
          // Without this pdf.js opens a stream over the whole file as well, and
          // on a fast connection that stream simply wins: the entire document
          // arrives anyway. Ranges only are what keeps memory bounded.
          disableStream: true,
          rangeChunkSize: 65_536,
          url: source,
          useSystemFonts: true,
        })
        : getDocument({ url: source, useSystemFonts: true });
      const opened = await task.promise;
      // numPages is known from the first chunk, which proves nothing about
      // whether the rest can be fetched. Reading a page is the real test.
      await opened.getPage(1);
      return opened;
    }

    async function open() {
      let opened: PdfDocumentProxy;
      try {
        opened = await openBy("ranges");
      } catch (cause) {
        if (cancelled) return;
        console.warn("Falling back to fetching the whole PDF:", cause);
        try {
          opened = await openBy("whole");
        } catch (fallbackCause) {
          if (!cancelled) {
            setError(fallbackCause instanceof Error && fallbackCause.message
              ? `The PDF could not be opened. ${fallbackCause.message}`
              : "The PDF could not be opened.");
          }
          return;
        }
      }
      if (cancelled) {
        void task?.destroy();
        return;
      }
      const first = await opened.getPage(1);
      const size = first.getViewport({ scale: 1 });
      setAspectRatio(size.height / size.width);
      setPageCount(opened.numPages);
      setDocument(opened);
    }

    void open();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [source]);

  // The column keeps its width however far a page overflows it, so it is the
  // one thing here that can be measured without the zoom measuring itself.
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const measure = () => setContainerWidth(column.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  /**
   * Zooming grows the page from the middle of the screen.
   *
   * It grew from the top left, which put the reader in the margin of a page
   * whose text runs down the centre. Because a page is now sized from the zoom
   * rather than from whatever was last painted, the new width is known in the
   * same frame and the column can be re-centred before anything is drawn.
   */
  useLayoutEffect(() => {
    const scroller = columnRef.current?.closest("[data-reader-scroll]");
    if (!scroller) return;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
  }, [zoom, containerWidth]);

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

    const scroller = column.closest("[data-reader-scroll]");
    if (!scroller) return;

    /*
     * Which page the reader is on, measured rather than remembered.
     *
     * It used to be decided from rectangles the observer had recorded when
     * visibility last changed, which is stale by the time scrolling has moved
     * them, and from a threshold that a page three times the width of the
     * screen never reached. The observer now only keeps track of which pages
     * are worth measuring; the measuring happens as the reader scrolls.
     */
    const onScreen = new Set<Element>();
    let frame = 0;

    function pickCurrentPage() {
      frame = 0;
      const paneTop = scroller!.getBoundingClientRect().top;
      let best: { page: number; top: number } | null = null;
      for (const element of onScreen) {
        const page = Number(element.getAttribute("data-page-number"));
        if (!Number.isInteger(page)) continue;
        const box = element.getBoundingClientRect();
        // The page you are reading is the one at the top of the pane: you are
        // on it until it has gone past. Choosing the page under the middle
        // instead reads the next one down whenever a page is shorter than the
        // screen, which in the text view is most of them.
        if (box.bottom <= paneTop + 1) continue;
        if (!best || box.top < best.top) best = { page, top: box.top };
      }
      if (best) setCurrentPage(best.page);
    }

    function schedule() {
      frame ||= requestAnimationFrame(pickCurrentPage);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target);
          else onScreen.delete(entry.target);
        }
        schedule();
      },
      { root: scroller },
    );
    for (const page of column.querySelectorAll("[data-page-number]")) {
      observer.observe(page);
    }
    scroller.addEventListener("scroll", schedule, { passive: true });
    // Pages change height under the reader: text arrives after the page is on
    // screen, and a drawn page replaces its reserved space. Without this the
    // count is whatever was true when the page was first seen.
    const resize = new ResizeObserver(schedule);
    resize.observe(column);
    return () => {
      observer.disconnect();
      resize.disconnect();
      scroller.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  // The view is a dependency because it decides which elements exist to watch:
  // switching it replaces every page in the column. Measured, the count keeps
  // up without this as well — so it is here for the observer to be pointed at
  // the elements it is meant to watch, not to fix an observed fault.
  }, [initialLocation, pageCount, view]);

  // Saved only once the page actually changes. Reporting the restored page
  // straight after mount wrote a row that said nothing new, and a test waiting
  // for "the progress request" could catch that one instead of the real move.
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
      // The page a passage belongs to is the page it is on, not the page in
      // front of the reader. They part company as soon as two pages share the
      // screen — and in the text view, where a short page leaves the middle of
      // the pane showing the next one, they part company immediately.
      const page = pageOfSelection(selection) ?? currentPage;
      const pageText = pageTextRef.current.get(page) ?? "";
      let paperStructure: ReturnType<typeof inferPaperStructure> | undefined;
      try {
        paperStructure = pageText.trim() ? inferPaperStructure(pageText) : undefined;
      } catch {
        paperStructure = undefined;
      }
      const captured = selection
        ? capturePdfSelection(selection, page, { documentTitle, pageText, paperStructure })
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

  // Counted so the effect below has something to react to: the text of a page
  // arrives after the page is already on screen, and a ref changing is not a
  // reason for anything to run again.
  const [extracted, setExtracted] = useState(0);

  const rememberPageText = useCallback((page: number, text: string) => {
    pageTextRef.current.set(page, text);
    setExtracted((current) => current + 1);
  }, []);

  // What the reader is looking at, reported when the page changes and again
  // when that page's text is finally known.
  useEffect(() => {
    onVisibleTextChange?.(pageTextRef.current.get(currentPage) ?? "");
  }, [currentPage, extracted, onVisibleTextChange]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</div>
    );
  }

  return (
    <section aria-label="PDF reader">
      {toolbarHost && createPortal(
        <div
          aria-label="PDF controls"
          className="flex flex-wrap items-center gap-2 px-(--gutter) py-2"
          role="group"
        >
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-quiet">Page</span>
            <input
              aria-label="Page number"
              className="border-edge bg-field min-h-11 w-16 rounded-lg border px-2 text-center text-base tabular-nums"
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
              of {pageCount || "…"}
            </span>
          </label>
          <div aria-label="Reading view" className="ml-auto flex items-center gap-1" role="group">
            {([["pages", "Pages"], ["text", "Text"]] as const).map(([candidate, label]) => (
              <button
                aria-pressed={view === candidate}
                className={`border-edge min-h-11 rounded-lg border px-3 text-xs tracking-wide uppercase transition-colors duration-(--fast) ${
                  view === candidate ? "bg-marker border-marker text-ink-on-marker" : "text-ink-quiet hover:text-ink"
                }`}
                key={candidate}
                onClick={() => setStoredPdfView(candidate)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {view === "pages" && (
          <div aria-label="Page zoom" className="flex items-center gap-1" role="group">
            <button
              aria-label="Zoom out"
              className="border-edge min-h-11 rounded-lg border px-3 text-sm"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((current) => Math.max(MIN_ZOOM, Math.round((current - 0.25) * 100) / 100))}
              type="button"
            >
              −
            </button>
            <button
              aria-label={`Zoom, currently ${Math.round(zoom * 100)} percent. Reset to fit width`}
              className="border-edge min-h-11 rounded-lg border px-2 text-sm tabular-nums"
              onClick={() => setZoom(1)}
              type="button"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="Zoom in"
              className="border-edge min-h-11 rounded-lg border px-3 text-sm"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((current) => Math.min(MAX_ZOOM, Math.round((current + 0.25) * 100) / 100))}
              type="button"
            >
              +
            </button>
          </div>
          )}
        </div>,
        toolbarHost,
      )}

      <div className="flex flex-col gap-4 sm:gap-6" ref={columnRef}>
        {document_ && pageCount > 0
          ? Array.from({ length: pageCount }, (_, index) => (
            view === "text" ? (
              <PdfTextPage
                document={document_}
                highlights={highlights}
                key={index + 1}
                onTextExtracted={rememberPageText}
                pageNumber={index + 1}
              />
            ) : (
              <PdfPage
                aspectRatio={aspectRatio}
                containerWidth={containerWidth}
                document={document_}
                highlights={highlights}
                key={index + 1}
                onTextExtracted={rememberPageText}
                pageNumber={index + 1}
                zoom={zoom}
              />
            )
          ))
          : <p aria-live="polite" className="text-sm">Opening…</p>}
      </div>

      <section aria-label="PDF selection preview" className="mx-3 mt-4 rounded-xl border border-rule p-3 text-sm sm:mx-0">
        {capturedSelection?.text ||"Select PDF text to prepare it for AI actions."}
      </section>
    </section>
  );
}
