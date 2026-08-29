/**
 * A page's paragraphs, taken from the PDF's own idea of its structure.
 *
 * A line break in a PDF is where the typesetter ended a line, not where a
 * thought ended, so reconstructing prose from the geometry is guesswork however
 * carefully it is done. A tagged PDF does not need guessing: it carries a
 * structure tree that says which marked-content runs make up a paragraph, a
 * heading, a list item — the logical document the visual one was set from.
 *
 * Not every PDF is tagged. Where the tree is absent or says nothing useful this
 * returns null and the caller falls back to reading the layout.
 */

/** The shape pdf.js returns from getStructTree(). */
export type StructTreeNode = {
  role?: string;
  children?: readonly (StructTreeNode | { type: "content"; id: string })[];
};

/** A text item, or one of the markers that appear with marked content. */
export type MarkedTextItem =
  | { str: string; hasEOL?: boolean }
  | { type: "beginMarkedContent" | "beginMarkedContentProps"; id?: string | null }
  | { type: "endMarkedContent" };

/**
 * Roles that hold prose. Anything else — Document, Sect, Part, Art — is a
 * container, and its text belongs to whichever of these sits inside it.
 */
const BLOCK_ROLES = new Set([
  "Caption", "Formula", "H", "H1", "H2", "H3", "H4", "H5", "H6",
  "LBody", "Lbl", "P", "TD", "TH", "Title",
]);

function isContent(node: unknown): node is { type: "content"; id: string } {
  return typeof node === "object" && node !== null
    && (node as { type?: unknown }).type === "content"
    && typeof (node as { id?: unknown }).id === "string";
}

/** Which block each marked-content id belongs to, and the order of the blocks. */
function mapContentToBlocks(tree: StructTreeNode): Map<string, number> {
  const blockOf = new Map<string, number>();
  let blocks = 0;

  const walk = (node: StructTreeNode, enclosing: number | null) => {
    // A block role opens a new block; nested ones (a Lbl inside an LI) open
    // their own, which is what keeps a list from collapsing into one run.
    const block = node.role && BLOCK_ROLES.has(node.role) ? blocks++ : enclosing;
    for (const child of node.children ?? []) {
      if (isContent(child)) {
        if (block !== null) blockOf.set(child.id, block);
      } else {
        walk(child as StructTreeNode, block);
      }
    }
  };

  walk(tree, null);
  return blockOf;
}

/** Joins what was one paragraph on the page into one paragraph of prose. */
function joinRuns(runs: readonly { text: string; endsLine: boolean }[]): string {
  let joined = "";
  for (const run of runs) {
    if (!joined) {
      joined = run.text;
    } else if (joined.endsWith("-")) {
      // A hyphen at a line end is a word cut in half, not punctuation.
      joined = joined.slice(0, -1) + run.text.replace(/^\s+/, "");
    } else if (/\s$/.test(joined) || /^\s/.test(run.text)) {
      joined += run.text;
    } else {
      joined += " " + run.text;
    }
    if (run.endsLine && !joined.endsWith("-")) joined += " ";
  }
  return joined.replace(/\s+/g, " ").trim();
}

export function paragraphsFromStructure(
  tree: StructTreeNode | null | undefined,
  items: readonly MarkedTextItem[],
): string[] | null {
  if (!tree) return null;
  const blockOf = mapContentToBlocks(tree);
  if (blockOf.size === 0) return null;

  const runs = new Map<number, { text: string; endsLine: boolean }[]>();
  const open: (string | null)[] = [];

  for (const item of items) {
    const marker = (item as { type?: string }).type;
    if (marker === "beginMarkedContent" || marker === "beginMarkedContentProps") {
      open.push((item as { id?: string | null }).id ?? null);
      continue;
    }
    if (marker === "endMarkedContent") {
      open.pop();
      continue;
    }

    const text = (item as { str?: string }).str;
    if (typeof text !== "string" || !text) continue;
    // The innermost enclosing run that the structure tree claims.
    let block: number | undefined;
    for (let depth = open.length - 1; depth >= 0; depth -= 1) {
      const id = open[depth];
      if (id && blockOf.has(id)) {
        block = blockOf.get(id);
        break;
      }
    }
    if (block === undefined) continue;
    runs.set(block, [
      ...runs.get(block) ?? [],
      { endsLine: Boolean((item as { hasEOL?: boolean }).hasEOL), text },
    ]);
  }

  const paragraphs = [...runs.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, parts]) => joinRuns(parts))
    .filter((paragraph) => paragraph);
  return paragraphs.length > 0 ? paragraphs : null;
}
