import { normalizePdfSelectionText } from "./capture";

/**
 * The selected text as it would be typed, not as it was typeset.
 *
 * A PDF's text layer hands over one line per line on the page, with the
 * hyphens the compositor added. Pasted into a translator or a chat that is a
 * paragraph broken every ten words, and every tool then asks whether "at-"
 * and "tend" are two words. Paragraph breaks — a blank line between them — are
 * the one thing the layout says that is worth keeping.
 */
export function copyableText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map(normalizePdfSelectionText)
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The text with where it came from, in the form a note or a question wants
 * it: the passage, a blank line, then an attribution line.
 */
export function citation(
  text: string,
  where: { title?: string; section?: string; page?: number },
): string {
  const title = where.title?.trim();
  const section = where.section?.trim();
  const parts = [
    title,
    section && `§${section}`,
    Number.isInteger(where.page) && where.page! > 0 && `p.${where.page}`,
  ].filter(Boolean);
  return parts.length ? `${text}\n\n— ${parts.join(", ")}` : text;
}
