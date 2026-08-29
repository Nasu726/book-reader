"use client";

import { useEffect, useRef, useState } from "react";
import { getDocument, TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";

import { extractPdfText } from "@/core/documents/pdf-extraction";
import { clearHighlights, paintHighlights, type PaintableHighlight } from "./highlight-paint";

/**
 * What went wrong, in enough detail to act on.
 *
 * A minified stack frame is not for the reader — it is for whoever they report
 * this to. "This page could not be drawn" with a Try again that fails the same
 * way gives nobody anything to work with, and the fault has so far only ever
 * appeared on a device that cannot be attached to a debugger.
 */
function describeFailure(stage: string, cause: unknown): string {
  const message = cause instanceof Error && cause.message ? cause.message : String(cause);
  const frame = cause instanceof Error
    ? (cause.stack ?? "").split("\n").map((line) => line.trim()).find((line) => line && line !== message)
    : undefined;
  return [`While ${stage}: ${message}`, frame].filter(Boolean).join("\n");
}

/** Derived from pdf.js rather than described by hand, so the calls stay honest. */
export type PdfDocumentProxy = Awaited<ReturnType<typeof getDocument>["promise"]>;

type PdfPageProps = {
  document: PdfDocumentProxy;
  pageNumber: number;
  /** Multiplier on top of fit-to-width. */
  zoom: number;
  /** Page size at scale 1, used to hold space before the page is drawn. */
  aspectRatio: number;
  /** Every saved highlight; this page draws the ones that name its number. */
  highlights?: readonly PaintableHighlight[];
  onTextExtracted?: (pageNumber: number, text: string) => void;
};

/**
 * One page of a PDF, drawn only while it is near the viewport.
 *
 * Each page owns its own canvas, text layer, and error state. A single shared
 * error state let a failed render overwrite a successful one, which is how a
 * page that was plainly visible on screen still carried "This PDF page could
 * not be rendered" with a Retry button that changed nothing.
 */
export function PdfPage({
  document: pdfDocument,
  pageNumber,
  zoom,
  aspectRatio,
  highlights = [],
  onTextExtracted,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Counts completed draws rather than recording that one happened, so that a
  // re-draw — a resize, a zoom — is something the highlights can react to.
  const [layerVersion, setLayerVersion] = useState(0);
  const drawn = layerVersion > 0;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Draw a page when it comes within a screen of the viewport, so scrolling
  // does not wait on rendering, and a long document does not render at once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100% 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Give the page back once it is well out of the way.
  //
  // A drawn canvas holds its pixels for as long as it exists, and on a phone
  // that is 8 MB a page: the reader's iPhone renders at three device pixels to
  // one, so an A4 page at 402 points wide is 1206 x 1706. Keeping every page
  // ever scrolled past is how a long PDF stops drawing altogether — iOS Safari
  // caps how much canvas a page may hold and simply refuses the next one, which
  // no amount of pressing Try again can undo.
  //
  // Three screens of slack, so ordinary back-and-forth reading never pays to
  // redraw. The reserved aspect ratio takes over again, so nothing moves.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) return;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        textLayerRef.current?.replaceChildren();
        clearHighlights({ format: "pdf", page: pageNumber });
        setLayerVersion(0);
      },
      { rootMargin: "300% 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [pageNumber]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const layer = textLayerRef.current;
    const container = containerRef.current;
    if (!canvas || !layer || !container) return;

    let cancelled = false;
    // Which step was running when it went wrong. A message on its own does not
    // say whether the page failed to arrive, to paint, or to become selectable,
    // and those are three different faults with three different causes.
    let stage = "loading the page";
    // pdf.js refuses to draw onto a canvas another render is still using, so a
    // resize or a zoom arriving mid-draw would throw and leave the page showing
    // an error it could not recover from.
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function draw() {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;
        stage = "measuring the page";

        // The canvas and the text layer must share one display scale, or the
        // selectable text drifts away from the glyphs on the canvas.
        const unscaled = page.getViewport({ scale: 1 });
        const available = container!.clientWidth || unscaled.width;
        const cssScale = (available / unscaled.width) * zoom;
        const viewport = page.getViewport({ scale: cssScale });
        const devicePixelRatio = window.devicePixelRatio || 1;

        canvas!.width = Math.floor(viewport.width * devicePixelRatio);
        canvas!.height = Math.floor(viewport.height * devicePixelRatio);
        canvas!.style.width = `${Math.floor(viewport.width)}px`;
        canvas!.style.height = `${Math.floor(viewport.height)}px`;
        stage = "drawing the page";
        task = page.render({
          canvas: canvas!,
          viewport: page.getViewport({ scale: cssScale * devicePixelRatio }),
        });
        await task.promise;
        task = null;
        if (cancelled) return;

        stage = "reading the text";
        const textContent = await page.getTextContent();
        if (cancelled) return;

        try {
          onTextExtracted?.(
            pageNumber,
            extractPdfText(textContent.items as unknown as Parameters<typeof extractPdfText>[0]),
          );
        } catch {
          // Extraction feeds AI context only; a failure here must not stop the
          // page from being readable.
        }

        stage = "placing the selectable text";
        layer!.replaceChildren();
        layer!.style.setProperty("--scale-factor", String(cssScale));
        layer!.style.setProperty("--user-unit", "1");
        layer!.style.setProperty("--total-scale-factor", "calc(var(--scale-factor) * var(--user-unit))");
        layer!.style.width = `${Math.floor(viewport.width)}px`;
        layer!.style.height = `${Math.floor(viewport.height)}px`;
        await new TextLayer({
          container: layer!,
          textContentSource: textContent,
          viewport,
        }).render();
        page.cleanup();
        if (!cancelled) { setError(null); setLayerVersion((current) => current + 1); }
      } catch (cause) {
        // A cancelled render rejects on its way out. That is this component
        // tidying up, not a page that failed to draw.
        const name = (cause as { name?: string } | null)?.name;
        if (cancelled || name === "RenderingCancelledException") return;
        // Carried to the screen rather than swallowed. "This page could not be
        // drawn" with a button that fails the same way tells a reader nothing
        // and leaves nobody anything to report.
        setError(describeFailure(stage, cause));
      }
    }

    void draw();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, pdfDocument, pageNumber, zoom, attempt, onTextExtracted]);

  // Never before the text layer exists: the spans a highlight points at are
  // created by that render, and pdf.js replaces them wholesale every time the
  // page is drawn again — which is what layerVersion is here to notice.
  useEffect(() => {
    const layer = textLayerRef.current;
    if (layerVersion === 0 || !layer) return;
    paintHighlights(layer, highlights, { format: "pdf", page: pageNumber });
  }, [highlights, layerVersion, pageNumber]);

  // A page scrolled far out of view keeps its ranges registered against nodes
  // that are still in the document, so only unmounting has to clean up.
  useEffect(() => () => clearHighlights({ format: "pdf", page: pageNumber }), [pageNumber]);

  // Re-draw when the column changes width: a rotated phone, a resized window,
  // or the pane beside it appearing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width && width !== lastWidth) {
        lastWidth = width;
        setAttempt((current) => current + 1);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="relative mx-auto"
      data-page-number={pageNumber}
      ref={containerRef}
      style={{ aspectRatio: drawn ? undefined : `1 / ${aspectRatio}` }}
    >
      {/* Hidden until drawn: an untouched canvas is 300x150 by default, which
          would sit in the middle of the reserved space as a small white box. */}
      <canvas className={drawn ? "block" : "hidden"} ref={canvasRef} />
      <div className="textLayer absolute inset-0" ref={textLayerRef} />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper/90 text-sm" role="alert">
          <p>Page {pageNumber} could not be drawn.</p>
          <p className="text-ink-quiet max-w-[40ch] text-center text-xs break-words whitespace-pre-line">
            {error}
          </p>
          <button
            className="min-h-10 rounded bg-ink px-3 text-white"
            onClick={() => { setError(null); setAttempt((current) => current + 1); }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
