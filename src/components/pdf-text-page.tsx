"use client";

import { useEffect, useRef, useState } from "react";

import { extractPdfParagraphs, extractPdfText } from "@/core/documents/pdf-extraction";
import { clearHighlights, paintHighlights, type PaintableHighlight } from "./highlight-paint";
import type { PdfDocumentProxy } from "./pdf-page";

type PdfTextPageProps = {
  document: PdfDocumentProxy;
  pageNumber: number;
  highlights?: readonly PaintableHighlight[];
  onTextExtracted?: (pageNumber: number, text: string) => void;
};

/**
 * One page of a PDF as prose.
 *
 * The page view draws the paper and lays invisible text over it, which is what
 * a PDF is and why selecting from it feels the way it does: the spans are
 * placed per drawing instruction, in the order the file draws them, with no
 * words or paragraphs to catch hold of. Here the same text is real prose in the
 * document, so selection, find-in-page and text size behave the way they do
 * everywhere else.
 *
 * What is lost is the page: figures, tables, columns as printed, anything the
 * layout was carrying. That is why this is the second way to read and not the
 * only one.
 */
export function PdfTextPage({
  document: pdfDocument,
  pageNumber,
  highlights = [],
  onTextExtracted,
}: PdfTextPageProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read when the page comes near, like the drawn one. A long document should
  // not parse itself end to end before showing its first page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "150% 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || paragraphs) return;
    let cancelled = false;

    async function read() {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent();
        if (cancelled) return;
        const items = content.items as unknown as Parameters<typeof extractPdfParagraphs>[0];
        setParagraphs(extractPdfParagraphs(items));
        onTextExtracted?.(pageNumber, extractPdfText(items));
        page.cleanup();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.message ? cause.message : "Unknown error.");
        }
      }
    }

    void read();
    return () => { cancelled = true; };
  }, [visible, paragraphs, pdfDocument, pageNumber, onTextExtracted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !paragraphs) return;
    paintHighlights(container, highlights, { format: "pdf", page: pageNumber });
  }, [highlights, pageNumber, paragraphs]);

  useEffect(() => () => clearHighlights({ format: "pdf", page: pageNumber }), [pageNumber]);

  return (
    <article
      className="reader-prose max-w-prose"
      data-page-number={pageNumber}
      ref={containerRef}
    >
      {paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {error && (
        <p className="border-marker border-l-2 pl-3 text-sm" role="alert">
          Page {pageNumber} could not be read. {error}
        </p>
      )}
      {!paragraphs && !error && (
        // Space held so the column does not shorten and lengthen while reading.
        <p aria-hidden className="text-ink-quiet min-h-64">Page {pageNumber}</p>
      )}
    </article>
  );
}
