"use client";

import {
  HIGHLIGHT_COLORS,
  highlightRegistryName,
  type HighlightColor,
} from "@/core/highlights/colors";
import { findRangeByOffsets, findRangeByText } from "@/core/selection/find-range";

export type PaintableHighlight = {
  id: string;
  color: HighlightColor;
  location: string;
  selectedText: string;
};

/** Which part of the book is on screen, and therefore which highlights apply. */
export type PaintTarget =
  | { format: "epub"; sectionId: string }
  | { format: "pdf"; page: number };

/**
 * Marked passages, coloured in the text itself.
 *
 * Drawn with the CSS Custom Highlight API rather than by wrapping the text in
 * elements. Nothing in the document is modified, which matters three times
 * over: pdf.js rebuilds its text layer whenever a page is re-rendered and would
 * throw any inserted markup away, the EPUB body is sanitized author markup that
 * should not gain nodes it never had, and the text handed to a selection, a
 * copy, or the model stays exactly what it was.
 *
 * Where the API is missing — anything older than Chrome 105, Safari 17.2 or
 * Firefox 140 — nothing is painted and everything else still works: the
 * highlight is saved, listed, and deletable as before.
 */

/** Live ranges per rendered container, so pages can come and go independently. */
const groups = new Map<string, Map<HighlightColor, Range[]>>();

function registry(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}

/** Rebuilds every colour from every group. One registry entry per colour. */
function commit(): void {
  const highlights = registry();
  if (!highlights) return;

  for (const color of HIGHLIGHT_COLORS) {
    const ranges: Range[] = [];
    for (const group of groups.values()) {
      const forColor = group.get(color);
      if (forColor) ranges.push(...forColor);
    }
    const name = highlightRegistryName(color);
    if (ranges.length === 0) highlights.delete(name);
    else highlights.set(name, new Highlight(...ranges));
  }
}

function groupKey(target: PaintTarget): string {
  return target.format === "epub" ? `epub:${target.sectionId}` : `pdf:${target.page}`;
}

/** The highlights that belong to what is on screen, as ranges in it. */
function rangesFor(
  container: Node,
  highlights: readonly PaintableHighlight[],
  target: PaintTarget,
): Map<HighlightColor, Range[]> {
  const byColor = new Map<HighlightColor, Range[]>();
  const ownerDocument = container.ownerDocument ?? globalThis.document;
  if (!ownerDocument) return byColor;

  for (const highlight of highlights) {
    let located: ReturnType<typeof findRangeByText> = null;
    try {
      const location = JSON.parse(highlight.location) as {
        endOffset?: unknown;
        page?: unknown;
        sectionId?: unknown;
        startOffset?: unknown;
      };
      if (target.format === "epub") {
        if (location.sectionId !== target.sectionId) continue;
        if (!Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) continue;
        located = findRangeByOffsets(
          container,
          location.startOffset as number,
          location.endOffset as number,
        );
      } else {
        if (location.page !== target.page) continue;
        located = findRangeByText(container, highlight.selectedText);
      }
    } catch {
      // A location that will not parse belongs to no page; skip this one only.
      continue;
    }
    if (!located) continue;

    const range = ownerDocument.createRange();
    try {
      range.setStart(located.start.node, located.start.offset);
      range.setEnd(located.end.node, located.end.offset);
    } catch {
      // Offsets that no longer fit the text on screen: the passage moved or the
      // page re-flowed. One highlight goes unpainted; the rest still draw.
      continue;
    }
    const existing = byColor.get(highlight.color);
    if (existing) existing.push(range);
    else byColor.set(highlight.color, [range]);
  }
  return byColor;
}

/** Colours one rendered page or chapter. Replaces whatever it held before. */
export function paintHighlights(
  container: Node,
  highlights: readonly PaintableHighlight[],
  target: PaintTarget,
): void {
  if (!registry()) return;
  groups.set(groupKey(target), rangesFor(container, highlights, target));
  commit();
}

/** Forgets one page or chapter, when it is removed or redrawn. */
export function clearHighlights(target: PaintTarget): void {
  if (!groups.delete(groupKey(target))) return;
  commit();
}

/** Forgets everything, when the reader leaves the document. */
export function clearAllHighlights(): void {
  if (groups.size === 0) return;
  groups.clear();
  commit();
}
