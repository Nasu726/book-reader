"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { capturePdfSelection, type DocumentSelection } from "@/core/selection/capture";
import { extractPdfText } from "@/core/documents/pdf-extraction";
import { inferPaperStructure } from "@/core/documents/paper-structure";
import { usePageShortcuts } from "./use-page-shortcuts";

GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${version}`;

/** Fit-width is 1; the range covers small print and large-format scans. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

type PdfRendererProps = {
  documentTitle?: string;
  source: string;
  initialLocation?: string | null;
  onLocationChange?: (location: string) => void;
  onSelectionChange?: (selection: DocumentSelection | null) => void;
};

export function PdfRenderer({
  documentTitle = "",
  initialLocation,
  onLocationChange,
  onSelectionChange,
  source,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const parsedInitialPageNumber = (() => {
    try {
      if (!initialLocation) return 1;
      const location = JSON.parse(initialLocation) as { page?: unknown; version?: unknown };
      return location.version === 1 && Number.isInteger(location.page)
        ? Math.max(1, location.page as number)
        : 1;
    } catch {
      return 1;
    }
  })();
  const [restoredInitialLocation, setRestoredInitialLocation] = useState<string | null | undefined>(undefined);
  if (
    initialLocation !== undefined &&
    restoredInitialLocation !== initialLocation
  ) {
    setPageNumber(parsedInitialPageNumber);
    setRestoredInitialLocation(initialLocation);
  }

  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturedSelection, setCapturedSelection] = useState<DocumentSelection | null>(null);
  type PdfLoadingTask = ReturnType<typeof getDocument>;
  type PdfDocument = Awaited<PdfLoadingTask["promise"]>;
  const documentRef = useRef<PdfDocument | null>(null);
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const [documentReady, setDocumentReady] = useState(false);
  const extractedPageTextRef = useRef("");
  const renderedWidthRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const response = await fetch(source);
        const data = await response.arrayBuffer();
        const loadingTask = getDocument({ data, useSystemFonts: true });
        const document = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        loadingTaskRef.current = loadingTask;
        documentRef.current = document;
        setPageCount(document.numPages);
        setDocumentReady(true);
      } catch {
        setError("The PDF could not be opened.");
      } finally {
        setLoading(false);
      }
    }

    void open();
    return () => {
      cancelled = true;
      void loadingTaskRef.current?.destroy();
      documentRef.current = null;
      loadingTaskRef.current = null;
    };
  }, [source]);

  const renderPage = useCallback(async (target: number) => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    const layer = textLayerRef.current;
    if (!document || !canvas || !layer) {
      return;
    }
    const bounded = Math.min(pageCount || 1, Math.max(1, target));
    setPageNumber(bounded);
    setError(null);
    try {
      const page = await document.getPage(bounded);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas rendering is unavailable.");
      }

      // The canvas and the text layer must share one display scale, or the
      // selectable text drifts away from the glyphs painted on the canvas.
      const unscaled = page.getViewport({ scale: 1 });
      const availableWidth = pageAreaRef.current?.clientWidth || unscaled.width;
      const cssScale = (availableWidth / unscaled.width) * zoomRef.current;
      const viewport = page.getViewport({ scale: cssScale });
      const devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderedWidthRef.current = Math.floor(availableWidth);
      await page.render({
        canvas,
        viewport: page.getViewport({ scale: cssScale * devicePixelRatio }),
      }).promise;

      const textContent = await page.getTextContent();
      try {
        extractedPageTextRef.current = extractPdfText(textContent.items as unknown as Parameters<typeof extractPdfText>[0]);
      } catch {
        extractedPageTextRef.current = "";
      }
      layer.replaceChildren();
      layer.style.setProperty("--scale-factor", String(cssScale));
      layer.style.setProperty("--user-unit", "1");
      layer.style.setProperty("--total-scale-factor", "calc(var(--scale-factor) * var(--user-unit))");
      layer.style.setProperty("--scale-round-x", "1px");
      layer.style.setProperty("--scale-round-y", "1px");
      Object.assign(layer.style, {
        inset: "0",
        position: "absolute",
      } satisfies Partial<CSSStyleDeclaration>);
      const textLayer = new TextLayer({
        container: layer,
        textContentSource: textContent,
        viewport,
      });
      await textLayer.render();
      page.cleanup();
    } catch {
      setError("This PDF page could not be rendered.");
    }
  }, [pageCount]);

  useEffect(() => {
    zoomRef.current = zoom;
    if (documentReady && pageCount > 0) {
      // The resize observer only reacts to container width, so a zoom change
      // has to ask for the re-render itself.
      renderedWidthRef.current = 0;
      void renderPage(pageNumber);
    }
  }, [documentReady, pageCount, pageNumber, renderPage, zoom]);

  usePageShortcuts({
    enabled: documentReady && pageCount > 0,
    onNext: () => void renderPage(pageNumber + 1),
    onPrevious: () => void renderPage(pageNumber - 1),
  });

  // Rotating a phone or changing the reader font size resizes the page area.
  // Re-render at the new width so the text layer keeps matching the canvas.
  useEffect(() => {
    const pageArea = pageAreaRef.current;
    if (!pageArea || !documentReady) return;
    const observer = new ResizeObserver(() => {
      const width = Math.floor(pageArea.clientWidth);
      if (!width || width === renderedWidthRef.current) return;
      renderedWidthRef.current = width;
      void renderPage(pageNumber);
    });
    observer.observe(pageArea);
    return () => observer.disconnect();
  }, [documentReady, pageNumber, renderPage]);

  useEffect(() => {
    if (!documentReady || !onLocationChange) return;
    onLocationChange(JSON.stringify({ page: pageNumber, version: 1 }));
  }, [documentReady, onLocationChange, pageNumber]);

  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection();
      let paperStructure: ReturnType<typeof inferPaperStructure> | undefined;
      try {
        const pageText = extractedPageTextRef.current || pageArea?.textContent || "";
        paperStructure = pageText.trim() ? inferPaperStructure(pageText) : undefined;
      } catch {
        paperStructure = undefined;
      }
      const captured = selection ? capturePdfSelection(selection, pageNumber, {
        documentTitle,
        pageText: extractedPageTextRef.current || pageArea?.textContent || "",
        paperStructure,
      }) : null;
      setCapturedSelection(captured);
      onSelectionChange?.(captured);
    };
    const pageArea = pageAreaRef.current;
    pageArea?.addEventListener("mouseup", updateSelection);
    pageArea?.addEventListener("touchend", updateSelection);
    return () => {
      pageArea?.removeEventListener("mouseup", updateSelection);
      pageArea?.removeEventListener("touchend", updateSelection);
    };
  }, [documentTitle, onSelectionChange, pageNumber]);

  return (
    <section aria-label="PDF reader" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          disabled={loading || pageNumber <= 1}
          onClick={() => void renderPage(pageNumber - 1)}
          type="button"
        >
          Previous
        </button>
        <span aria-live="polite" className="text-sm">Page {pageNumber}{pageCount ? ` / ${pageCount}` : ""}</span>
        <div aria-label="Page zoom" className="flex items-center gap-1" role="group">
          <button
            aria-label="Zoom out"
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
            disabled={loading || zoom <= MIN_ZOOM}
            onClick={() => setZoom((current) => Math.max(MIN_ZOOM, Math.round((current - 0.25) * 100) / 100))}
            type="button"
          >
            −
          </button>
          <button
            aria-label={`Zoom, currently ${Math.round(zoom * 100)} percent. Reset to fit width`}
            className="min-h-11 rounded-lg border border-zinc-300 px-2 text-sm tabular-nums dark:border-zinc-700"
            disabled={loading}
            onClick={() => setZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
            disabled={loading || zoom >= MAX_ZOOM}
            onClick={() => setZoom((current) => Math.min(MAX_ZOOM, Math.round((current + 0.25) * 100) / 100))}
            type="button"
          >
            +
          </button>
        </div>
        <button
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          disabled={loading || pageNumber >= pageCount}
          onClick={() => void renderPage(pageNumber + 1)}
          type="button"
        >
          Next
        </button>
      </div>
      <div className="relative overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800" ref={pageAreaRef}>
        <canvas ref={canvasRef} />
        <div className="textLayer" ref={textLayerRef} />
      </div>
      {error && (
        <div className="space-y-2 rounded-lg border border-red-300 p-3 text-sm" role="alert">
          <p>{error}</p>
          <button className="min-h-10 rounded bg-zinc-900 px-3 text-white" onClick={() => void renderPage(pageNumber)} type="button">
            Retry
          </button>
        </div>
      )}
      <section aria-label="PDF selection preview" className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        {capturedSelection?.text || "Select PDF text to prepare it for AI actions."}
      </section>
    </section>
  );
}
