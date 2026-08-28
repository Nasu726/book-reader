/**
 * Where a saved highlight sits in the text that is on screen now.
 *
 * Returns node/offset pairs rather than a Range so the whole thing stays
 * testable without a browser; the caller builds the Range.
 *
 * EPUB and PDF arrive here with different evidence, which is why there are two
 * functions. An EPUB highlight already carries character offsets into its
 * section (see capturePdfSelection's counterpart in capture.ts), so it can be
 * placed exactly — the same word twice in a chapter is not ambiguous. A PDF
 * highlight carries only its page number, so its text has to be found.
 */

export type RangePoint = { node: Node; offset: number };
export type FoundRange = { start: RangePoint; end: RangePoint };

const TEXT_NODE = 3;

/** The text nodes under a container, in document order. */
function textNodes(container: Node): Text[] {
  const found: Text[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      found.push(node as Text);
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  visit(container);
  return found;
}

/**
 * The point at `offset` characters into the container's text.
 *
 * `atEnd` decides what happens exactly on a node boundary: a range's start
 * belongs to the following node, its end to the preceding one, so that neither
 * end lands on an empty edge.
 */
function pointAt(nodes: readonly Text[], offset: number, atEnd: boolean): RangePoint | null {
  let position = 0;
  for (const node of nodes) {
    const length = node.data.length;
    const withinThisNode = atEnd
      ? offset <= position + length
      : offset < position + length;
    if (withinThisNode) return { node, offset: offset - position };
    position += length;
  }
  // An offset exactly at the very end of the last node still has a home.
  const last = nodes[nodes.length - 1];
  return last && offset === position ? { node: last, offset: last.data.length } : null;
}

/** An EPUB highlight, placed by the offsets it was captured with. */
export function findRangeByOffsets(
  container: Node,
  startOffset: number,
  endOffset: number,
): FoundRange | null {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) return null;
  if (startOffset < 0 || endOffset <= startOffset) return null;

  const nodes = textNodes(container);
  if (nodes.length === 0) return null;

  const start = pointAt(nodes, startOffset, false);
  const end = pointAt(nodes, endOffset, true);
  return start && end ? { start, end } : null;
}

/**
 * Whitespace and line-broken hyphens removed, so that text taken off a PDF page
 * can be compared with text a reader selected there earlier.
 *
 * A PDF's text layer breaks lines wherever the page did, and a word split
 * across two lines keeps its hyphen. The stored selection went through
 * normalizePdfSelectionText, which resolves both — but only for a lower-case
 * continuation, so "trans-\nformation" became one word while "Ex-\nWife" kept
 * its hyphen and gained a space. Dropping the hyphen *and* the whitespace after
 * it treats those two the same way on both sides of the comparison, which is
 * all the search needs: the two strings only have to agree with each other.
 */
function normalizeForSearch(value: string): string {
  return value.replace(/-\s+/g, "").replace(/\s+/g, " ").trim();
}

/**
 * The normalized text of a container, with a map back to where each character
 * came from.
 */
function normalizedIndex(nodes: readonly Text[]): { text: string; origin: RangePoint[] } {
  // Every character of the raw text, remembered as the node it belongs to.
  const rawOrigin: RangePoint[] = [];
  let raw = "";
  for (const node of nodes) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      rawOrigin.push({ node, offset });
    }
    raw += node.data;
  }

  const origin: RangePoint[] = [];
  let text = "";
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character === "-" && /\s/.test(raw[index + 1] ?? "")) {
      index += 1;
      while (index < raw.length && /\s/.test(raw[index])) index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      while (index < raw.length && /\s/.test(raw[index])) index += 1;
      if (text.length > 0) {
        text += " ";
        origin.push(rawOrigin[index - 1] ?? rawOrigin[raw.length - 1]);
      }
      continue;
    }
    text += character;
    origin.push(rawOrigin[index]);
    index += 1;
  }

  // A trailing space has nothing after it to separate.
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    origin.pop();
  }
  return { text, origin };
}

/** A PDF highlight, placed by finding the text it was taken from. */
export function findRangeByText(container: Node, needle: string): FoundRange | null {
  const wanted = normalizeForSearch(needle);
  if (!wanted) return null;

  const nodes = textNodes(container);
  if (nodes.length === 0) return null;

  const { text, origin } = normalizedIndex(nodes);
  const at = text.indexOf(wanted);
  if (at < 0) return null;

  const start = origin[at];
  const last = origin[at + wanted.length - 1];
  if (!start || !last) return null;
  return { start, end: { node: last.node, offset: last.offset + 1 } };
}
