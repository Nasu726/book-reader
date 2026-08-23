export const DOCUMENT_SELECTION_VERSION = 1;

export type DocumentSelection = {
  version: typeof DOCUMENT_SELECTION_VERSION;
  format: "epub" | "pdf";
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

  return {
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
  };
}

export function capturePdfSelection(
  selection: Selection,
  pageNumber: number,
): DocumentSelection | null {
  const text = normalizePdfSelectionText(selection.toString());
  if (!text || !Number.isInteger(pageNumber) || pageNumber < 1) return null;

  return {
    format: "pdf",
    location: JSON.stringify({
      page: pageNumber,
      source: "text-layer-viewport",
      version: DOCUMENT_SELECTION_VERSION,
    }),
    text,
    version: DOCUMENT_SELECTION_VERSION,
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
