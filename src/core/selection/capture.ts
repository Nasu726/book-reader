export const DOCUMENT_SELECTION_VERSION = 1;

/**
 * What the reader picked: the text, and where in the document it is.
 *
 * The title and the section ride along so a copy can name its source; they
 * are never part of the persisted location. Nothing here is about the model
 * that used to read it — the surrounding text and the inferred paper
 * structure went with the AI (D-52).
 */
export type DocumentSelection = {
  version: typeof DOCUMENT_SELECTION_VERSION;
  documentTitle?: string;
  /** The heading the passage is under, by the document's own contents. */
  sectionTitle?: string;
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

const TEXT_NODE = 3;

function firstTextNodeIn(node: Node): Text | null {
  if (node.nodeType === TEXT_NODE) return node as Text;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = firstTextNodeIn(child);
    if (found) return found;
  }
  return null;
}

function lastTextNodeIn(node: Node): Text | null {
  if (node.nodeType === TEXT_NODE) return node as Text;
  for (let child = node.lastChild; child; child = child.previousSibling) {
    const found = lastTextNodeIn(child);
    if (found) return found;
  }
  return null;
}

/**
 * A selection boundary expressed against a text node.
 *
 * A boundary is not always one to begin with: triple-clicking a paragraph, or
 * dragging past the end of one, leaves Chrome holding an element and a child
 * index instead. `(element, i)` means "before the i-th child", so the same
 * place in the text is the end of the last text before that child, or the start
 * of the first text after it.
 */
function toTextBoundary(node: Node, offset: number): { node: Node; offset: number } {
  if (node.nodeType === TEXT_NODE) return { node, offset };

  const children = node.childNodes;
  const boundary = Math.max(0, Math.min(offset, children.length));
  for (let index = boundary - 1; index >= 0; index -= 1) {
    const text = lastTextNodeIn(children[index]);
    if (text) return { node: text, offset: text.data.length };
  }
  for (let index = boundary; index < children.length; index += 1) {
    const text = firstTextNodeIn(children[index]);
    if (text) return { node: text, offset: 0 };
  }
  return { node, offset };
}

/**
 * How many characters into the section a selection boundary sits.
 *
 * Walking text nodes never found an element boundary, so the offset came back
 * as -1 and the whole selection was discarded: a triple-clicked paragraph could
 * not be highlighted or asked about at all.
 */
export function getSectionTextOffset(
  section: HTMLElement,
  node: Node,
  offset: number,
  ownerDocument: Document = document,
): number {
  const boundary = toTextBoundary(node, offset);
  const walker = ownerDocument.createTreeWalker(section, 4);
  let position = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === boundary.node) {
      return Math.min(position + boundary.offset, position + (current.textContent?.length ?? 0));
    }
    position += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return -1;
}

export function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function withContext(
  captured: DocumentSelection,
  documentTitle: string,
  sectionTitle?: string,
): DocumentSelection {
  const title = documentTitle.trim();
  const section = sectionTitle?.trim();
  return {
    ...captured,
    ...(title && { documentTitle: title }),
    ...(section && { sectionTitle: section }),
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
  sectionTitle?: string,
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
  } satisfies Omit<DocumentSelection, "documentTitle" | "sectionTitle">;

  return withContext(captured, documentTitle, sectionTitle);
}

export function capturePdfSelection(
  selection: Selection,
  pageNumber: number,
  context?: { documentTitle: string; sectionTitle?: string },
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
  } satisfies Omit<DocumentSelection, "documentTitle" | "sectionTitle">;

  return withContext(captured, context?.documentTitle ?? "", context?.sectionTitle);
}

export function normalizePdfSelectionText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/-\n([a-z])/g, "$1")
    .replace(/([^\n.!?)\]])\n(?!\n)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}
