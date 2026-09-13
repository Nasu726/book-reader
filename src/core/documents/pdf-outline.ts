/**
 * The document's own table of contents, read rather than inferred.
 *
 * A PDF made from LaTeX or by a publisher usually carries an outline — the
 * bookmarks a viewer shows in its sidebar — naming each section and the page
 * it starts on. That is the paper's structure as the author declared it, so
 * where it exists there is nothing to guess (D-45 made the same choice for
 * paragraphs). A PDF without one is left to the page-level heuristics.
 */

export type OutlineEntry = {
  title: string;
  /** 1-based, like everywhere else the reader shows a page. */
  page: number;
  /** 0 for a top-level entry; subsections are deeper. */
  depth: number;
};

type OutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineItem[];
};

/** The part of a pdf.js document this needs, so a test can hand in a fake. */
export type OutlineSource = {
  getOutline(): Promise<OutlineItem[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
};

/** Subsections of subsections are more than a select can show or a reader wants. */
const MAX_DEPTH = 1;

async function pageOf(pdf: OutlineSource, dest: OutlineItem["dest"]): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    const target = Array.isArray(explicit) ? explicit[0] : null;
    if (target === null || target === undefined) return null;
    // A reference to the page object, normally; a few producers write the page
    // index itself.
    const index = typeof target === "number" ? target : await pdf.getPageIndex(target);
    return Number.isInteger(index) && index >= 0 ? index + 1 : null;
  } catch {
    return null;
  }
}

/**
 * Every entry in outline order, or nothing when the document has none.
 *
 * Entries that point nowhere are dropped rather than kept as dead rows: a
 * contents list is for going somewhere.
 */
export async function readPdfOutline(pdf: OutlineSource): Promise<OutlineEntry[]> {
  const items = await pdf.getOutline().catch(() => null);
  const entries: OutlineEntry[] = [];

  async function walk(list: readonly OutlineItem[], depth: number): Promise<void> {
    for (const item of list) {
      const title = (item.title ?? "").replace(/\s+/g, " ").trim();
      const page = await pageOf(pdf, item.dest);
      if (title && page !== null) entries.push({ title, page, depth });
      if (item.items?.length && depth < MAX_DEPTH) await walk(item.items, depth + 1);
    }
  }

  if (items?.length) await walk(items, 0);
  return entries;
}

/** The entry a page falls under: the last one that starts at or before it. */
export function sectionAt(
  outline: readonly OutlineEntry[],
  page: number,
): OutlineEntry | null {
  let found: OutlineEntry | null = null;
  for (const entry of outline) {
    if (entry.page <= page) found = entry;
  }
  return found;
}

/**
 * The pages an entry covers: from where it starts to just before the next
 * entry that starts on a later page, or to the end of the document.
 */
export function sectionPages(
  outline: readonly OutlineEntry[],
  entry: OutlineEntry,
  pageCount: number,
): [number, number] {
  const position = outline.indexOf(entry);
  const next = outline.slice(position + 1).find((later) => later.page > entry.page);
  return [entry.page, next ? next.page - 1 : Math.max(entry.page, pageCount)];
}
