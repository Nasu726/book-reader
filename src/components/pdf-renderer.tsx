"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { capturePdfSelection, type DocumentSelection } from "@/core/selection/capture";

GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${version}`;

const SAMPLE_PDF = "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNTg+PnN0cmVhbQpCVCAvRjEgMjQgVGYgNzIgNzIwIFRkIChTYW1wbGUgUERGIHRleHQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G";

type PdfRendererProps = {
  source?: string;
  initialLocation?: string | null;
  onLocationChange?: (location: string) => void;
  onSelectionChange?: (selection: DocumentSelection | null) => void;
};

export function PdfRenderer({
  initialLocation,
  onLocationChange,
  onSelectionChange,
  source = SAMPLE_PDF,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageNumber, setPageNumber] = useState(() => {
    if (typeof initialLocation !== "string") return 1;
    try {
      const location = JSON.parse(initialLocation) as { page?: unknown; version?: unknown };
      return location.version === 1 && Number.isInteger(location.page)
        ? Math.max(1, location.page as number)
        : 1;
    } catch {
      return 1;
    }
  });
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
      const deviceViewport = page.getViewport({ scale: window.devicePixelRatio || 1 });
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas rendering is unavailable.");
      }
      canvas.width = Math.floor(deviceViewport.width);
      canvas.height = Math.floor(deviceViewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      await page.render({ canvas, viewport: deviceViewport }).promise;

      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      layer.replaceChildren();
      Object.assign(layer.style, {
        inset: "0",
        position: "absolute",
      } satisfies Partial<CSSStyleDeclaration>);
      await new TextLayer({
        container: layer,
        textContentSource: textContent,
        viewport,
      }).render();
      page.cleanup();
    } catch {
      setError("This PDF page could not be rendered.");
    }
  }, [pageCount]);

  useEffect(() => {
    if (documentReady && pageCount > 0) {
      void renderPage(pageNumber);
    }
  }, [documentReady, pageCount, pageNumber, renderPage]);

  useEffect(() => {
    if (!documentReady || !onLocationChange) return;
    onLocationChange(JSON.stringify({ page: pageNumber, version: 1 }));
  }, [documentReady, onLocationChange, pageNumber]);

  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection();
      const captured = selection ? capturePdfSelection(selection, pageNumber) : null;
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
  }, [onSelectionChange, pageNumber]);

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
        <button
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          disabled={loading || pageNumber >= pageCount}
          onClick={() => void renderPage(pageNumber + 1)}
          type="button"
        >
          Next
        </button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800" ref={pageAreaRef}>
        <canvas ref={canvasRef} />
        <div ref={textLayerRef} />
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
