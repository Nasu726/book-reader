/**
 * The colours a highlight can be.
 *
 * A closed set rather than free text because the name becomes part of a CSS
 * highlight registry key and a `::highlight()` selector. Anything the server
 * accepted here would end up in a stylesheet lookup, so unknown values are
 * refused at the edge rather than sanitised later.
 */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** What a highlight is when nobody chose. */
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && (HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

/** The registry key and `::highlight()` name for one colour. */
export function highlightRegistryName(color: HighlightColor): string {
  return `book-reader-${color}`;
}
