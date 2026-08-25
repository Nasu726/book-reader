export const DOCUMENT_SELECTION_VERSION = 1;

import type { PaperStructure } from "@/core/documents/paper-structure";

export type DocumentSelection = {
  version: typeof DOCUMENT_SELECTION_VERSION;
  documentTitle?: string;
  format: "epub" | "pdf";
  paperStructure?: PaperStructure;
  surroundingText?: {
    after?: string;
    before?: string;
  };
  text: string;
  location: string;
};

type EpubRangeSource = {
  sectionId: string;
  text: string;
  startOffset: number;
  endOffset: number;
};

function isElement(node: Node | null): node is Element {
  return node?.nodeType === 1;
}

function closestSection(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (isElement(current)) {
      const section = current.closest<HTMLElement>("[data-reader-section]");
      if (section) return section;
    }
    current = current.parentElement ?? current.parentNode;
  }
  return null;
}

export function getSectionTextOffset(
  section: HTMLElement,
  node: Node,
  offset: number,
  ownerDocument: Document = document,
): number {
  const walker = ownerDocument.createTreeWalker(section, 4);
  let position = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) {
      return Math.min(position + offset, position + (current.textContent?.length ?? 0));
    }
    position += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return -1;
}

export function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractSurroundingText(
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
): { after?: string; before?: string } | undefined {
  const sectionText = container.textContent ?? "";
  if (startOffset < 0 || endOffset > sectionText.length) return undefined;

  const before = normalizeSelectionText(sectionText.slice(Math.max(0, startOffset - 240), startOffset));
  const after = normalizeSelectionText(sectionText.slice(endOffset, Math.min(sectionText.length, endOffset + 240)));
  return !before && !after ? undefined : { after: after || undefined, before: before || undefined };
}

function withContext(
  captured: DocumentSelection,
  documentTitle: string,
  surroundingText?: DocumentSelection["surroundingText"],
): DocumentSelection {
  const title = documentTitle.trim();
  return {
    ...captured,
    ...(title && { documentTitle: title }),
    ...(surroundingText && { surroundingText }),
  };
}

export function parseSelectionLocation(value: string): DocumentSelection | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !parsed || typeof parsed !== "object" ||
      !("format" in parsed) || !("text" in parsed) || !("location" in parsed)
    ) {
      return null;
    }
    const candidate = parsed as DocumentSelection;
    return candidate.version === DOCUMENT_SELECTION_VERSION &&
      (candidate.format === "epub" || candidate.format === "pdf") &&
      typeof candidate.text === "string" &&
      typeof candidate.location === "string"
      ? candidate
      : null;
  } catch {
    return null;
  }
}

export function captureEpubSelection(
  selection: Selection,
  ownerDocument: Document = document,
  documentTitle = ownerDocument.title,
): DocumentSelection | null {
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const container = closestSection(selection.anchorNode);
  if (!range || !container) return null;

  const sectionId = container.dataset.readerSection;
  if (!sectionId) return null;

  const text = normalizeSelectionText(selection.toString());
  if (!text) return null;
  const startOffset = getSectionTextOffset(
    container,
    range.startContainer,
    range.startOffset,
    ownerDocument,
  );
  const endOffset = getSectionTextOffset(
    container,
    range.endContainer,
    range.endOffset,
    ownerDocument,
  );
  if (startOffset < 0 || endOffset <= startOffset) return null;

  const captured = {
    format: "epub",
    location: JSON.stringify({
      endOffset,
      sectionId,
      startOffset,
      text,
      version: DOCUMENT_SELECTION_VERSION,
    } satisfies EpubRangeSource & { version: number }),
    text,
    version: DOCUMENT_SELECTION_VERSION,
  } satisfies Omit<DocumentSelection, "documentTitle" | "surroundingText">;

  return withContext(captured, documentTitle, extractSurroundingText(container, startOffset, endOffset));
}

export function capturePdfSelection(
  selection: Selection,
  pageNumber: number,
  context?: {
    documentTitle: string;
    pageText?: string;
    paperStructure?: PaperStructure;
  },
): DocumentSelection | null {
  const text = normalizePdfSelectionText(selection.toString());
  if (!text || !Number.isInteger(pageNumber) || pageNumber < 1) return null;

  const captured = {
    format: "pdf",
    location: JSON.stringify({
      page: pageNumber,
      source: "text-layer-viewport",
      version: DOCUMENT_SELECTION_VERSION,
    }),
    text,
    version: DOCUMENT_SELECTION_VERSION,
  } satisfies Omit<DocumentSelection, "documentTitle" | "surroundingText" | "paperStructure">;

  if (!context?.pageText?.trim()) {
    return {
      ...withContext(captured, context?.documentTitle ?? ""),
      ...(context?.paperStructure && { paperStructure: context.paperStructure }),
    };
  }

  const normalizedPageText = normalizeSelectionText(context.pageText);
  const normalizedSelectedText = normalizeSelectionText(text).toLowerCase();
  const selectedIndex = normalizedPageText.toLowerCase().indexOf(normalizedSelectedText);
  if (selectedIndex < 0) {
    return {
      ...withContext(captured, context.documentTitle),
      ...(context.paperStructure && { paperStructure: context.paperStructure }),
    };
  }

  const startOffset = selectedIndex;
  const endOffset = startOffset + normalizedSelectedText.length;
  const before = normalizeSelectionText(normalizedPageText.slice(Math.max(0, startOffset - 240), startOffset));
  const after = normalizeSelectionText(normalizedPageText.slice(endOffset, Math.min(normalizedPageText.length, endOffset + 240)));
  return {
    ...withContext(captured, context.documentTitle, {
      after: after || undefined,
      before: before || undefined,
    }),
    ...(context.paperStructure && { paperStructure: context.paperStructure }),
  };
}

export function normalizePdfSelectionText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/-\n([a-z])/g, "$1")
    .replace(/([^\n.!?)\]])\n(?!\n)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}
