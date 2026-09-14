import { useEffect, useRef, useState } from "react";

import { extractPdfParagraphs } from "@/core/documents/pdf-extraction";
import {
  paragraphsFromStructure,
  type MarkedTextItem,
  type StructTreeNode,
} from "@/core/documents/pdf-structure";
import { clearHighlights, paintHighlights, type PaintableHighlight } from "./highlight-paint";
import type { PdfDocumentProxy } from "./pdf-page";

type PdfTextPageProps = {
  document: PdfDocumentProxy;
  pageNumber: number;
  highlights?: readonly PaintableHighlight[];
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
/**
 * The copy control at the end of a paragraph.
 *
 * A thumb-sized target drawn small: 44 pixels to hit, an icon the size of a
 * letter to look at, and quiet until pointed at where there is a pointer.
 */
function CopyParagraph({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      aria-label={state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy paragraph"}
      className="text-ink-quiet hover:text-ink focus-visible:text-ink -my-3 ml-1 inline-flex h-11 w-11 items-center justify-center align-middle opacity-60 transition-opacity duration-(--fast) hover:opacity-100 focus-visible:opacity-100"
      onClick={() => void copy()}
      type="button"
    >
      {state === "copied" ? (
        <svg aria-hidden fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16">
          <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg aria-hidden fill="none" height="16" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16">
          <rect height="13" rx="2" width="13" x="8" y="8" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function PdfTextPage({
  document: pdfDocument,
  pageNumber,
  highlights = [],
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
        // Marked content, so the structure tree has something to point at.
        // Where a PDF is tagged it already knows where its paragraphs are, and
        // reading them off the page's geometry is guesswork by comparison.
        const [content, structure] = await Promise.all([
          page.getTextContent({ includeMarkedContent: true }),
          page.getStructTree().catch(() => null),
        ]);
        if (cancelled) return;

        const items = content.items as unknown as MarkedTextItem[];
        const tagged = paragraphsFromStructure(structure as StructTreeNode | null, items);
        const geometric = items as unknown as Parameters<typeof extractPdfParagraphs>[0];
        setParagraphs(tagged ?? extractPdfParagraphs(geometric));
        page.cleanup();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.message ? cause.message : "Unknown error.");
        }
      }
    }

    void read();
    return () => { cancelled = true; };
  }, [visible, paragraphs, pdfDocument, pageNumber]);

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
      {paragraphs?.map((paragraph, index) => (
        <p key={index}>
          {paragraph}
          {/* One tap for the whole paragraph, which is the unit a translator
              or a question wants and the hardest thing to select by hand on a
              phone. Inline at the end of the text, with the line box left
              alone by the negative margins, so the prose does not open up
              around a row of buttons. */}
          <CopyParagraph text={paragraph} />
        </p>
      ))}
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
