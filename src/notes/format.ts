/**
 * The note is the database.
 *
 * One Markdown file per document in the reader's vault, in a shape Obsidian
 * reads as a note: frontmatter it shows as properties, the marks as quote
 * callouts, and the memo under a heading. Everything the app owns sits
 * between two comment markers; everything outside them is the reader's and is
 * carried through untouched. The comments after each quote carry what the
 * app needs to find the passage again, so nothing else has to be stored.
 *
 * `renderNote` and `parseNote` are inverses: render → parse → render is the
 * identity, and the tests hold them to it.
 */

import type { HighlightColor } from "../core/highlights/colors";
import { HIGHLIGHT_COLORS } from "../core/highlights/colors";

export type NoteFrontmatter = {
  title: string;
  authors?: string[];
  source?: string;
  added: string;
  status: "reading" | "done";
  tags: string[];
  /**
   * Properties the reader added in Obsidian, as the lines they wrote them
   * on. Regenerating the frontmatter must not lose them.
   */
  extra?: string[];
};

export type NoteHighlight = {
  id: string;
  color: HighlightColor;
  selectedText: string;
  /** The envelope the painter finds the passage with, as JSON. */
  location: string;
  note?: string;
  /** Where it is, for a person: "p.3", "§Introduction". */
  where?: string;
};

export type NoteState = {
  frontmatter: NoteFrontmatter;
  highlights: NoteHighlight[];
  memo: string;
};

/** The reader's own text around the managed block, kept verbatim. */
export type Outside = { before: string; after: string };

const START = "<!-- book-reader:start -->";
const END = "<!-- book-reader:end -->";

// ---------------------------------------------------------------- frontmatter

/**
 * Quoted only when YAML would read it as something else: a number, a boolean,
 * a list, a comment. A date stays bare, which is how Obsidian knows it is one.
 */
function yamlScalar(value: string): string {
  const needsQuotes = value === "" || /^[\s"'#&*!|>%@`{}[\],?:-]|[:#]\s|\s$|[,\n"\\]/.test(value)
    || /^(true|false|null|yes|no|~)$/i.test(value) || /^[+-]?\d+(\.\d+)?$/.test(value);
  return needsQuotes ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"` : value;
}

function yamlList(values: readonly string[]): string {
  return `[${values.map(yamlScalar).join(", ")}]`;
}

function readScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** A flow list, `[a, "b, c"]`, split on commas outside quotes. */
function readList(raw: string): string[] {
  const value = raw.trim();
  if (!value.startsWith("[") || !value.endsWith("]")) return value ? [readScalar(value)] : [];
  const items: string[] = [];
  let current = "";
  // A quote opens an item only at its start; an apostrophe inside a bare
  // name is just an apostrophe.
  let quote: string | null = null;
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];
    if (quote) {
      current += char;
      if (char === "\\" && quote === "\"") { current += value[index + 1] ?? ""; index += 1; }
      else if (char === quote) quote = null;
    } else if ((char === "\"" || char === "'") && current.trim() === "") {
      quote = char;
      current = char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current);
  return items.map(readScalar).filter(Boolean);
}

function renderFrontmatter(front: NoteFrontmatter): string {
  const lines = [
    `title: ${yamlScalar(front.title)}`,
    front.authors?.length ? `authors: ${yamlList(front.authors)}` : null,
    front.source ? `source: ${yamlScalar(front.source)}` : null,
    `added: ${yamlScalar(front.added)}`,
    `status: ${front.status}`,
    `tags: ${yamlList(front.tags)}`,
    ...(front.extra ?? []),
  ].filter((line): line is string => line !== null);
  return `---\n${lines.join("\n")}\n---\n`;
}

function parseFrontmatter(markdown: string): { front: NoteFrontmatter; body: string } {
  const fallback: NoteFrontmatter = { added: "", status: "reading", tags: [], title: "" };
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) return { body: markdown, front: fallback };
  const front = { ...fallback };
  const extra: string[] = [];
  for (const line of match[1].split("\n")) {
    const pair = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (!pair) {
      if (line.trim()) extra.push(line);
      continue;
    }
    const [, key, raw] = pair;
    switch (key) {
      case "title": front.title = readScalar(raw); break;
      case "authors": { const authors = readList(raw); if (authors.length) front.authors = authors; break; }
      case "source": { const source = readScalar(raw); if (source) front.source = source; break; }
      case "added": front.added = readScalar(raw); break;
      case "status": front.status = readScalar(raw) === "done" ? "done" : "reading"; break;
      case "tags": front.tags = readList(raw); break;
      default: extra.push(line); break;
    }
  }
  if (extra.length) front.extra = extra;
  return { body: markdown.slice(match[0].length), front };
}

// ------------------------------------------------------------------ locations

/** `pdf:3`, `epub:ch1:0-19` — the envelope, compact enough for a comment. */
function compactLocation(location: string): string | null {
  try {
    const parsed = JSON.parse(location) as Record<string, unknown>;
    if (typeof parsed.page === "number") return `pdf:${parsed.page}`;
    if (typeof parsed.sectionId === "string" && typeof parsed.startOffset === "number" && typeof parsed.endOffset === "number") {
      return `epub:${parsed.sectionId}:${parsed.startOffset}-${parsed.endOffset}`;
    }
  } catch {
    // Not an envelope this format knows; the mark is written without one.
  }
  return null;
}

function expandLocation(compact: string, text: string): string | null {
  const pdf = /^pdf:(\d+)$/.exec(compact);
  if (pdf) return JSON.stringify({ page: Number(pdf[1]), source: "text-layer-viewport", version: 1 });
  const epub = /^epub:(.+):(\d+)-(\d+)$/.exec(compact);
  if (epub) {
    return JSON.stringify({
      endOffset: Number(epub[3]),
      sectionId: epub[1],
      startOffset: Number(epub[2]),
      text,
      version: 1,
    });
  }
  return null;
}

// ----------------------------------------------------------------- the block

function quoteLines(text: string): string {
  return text.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
}

function renderHighlight(highlight: NoteHighlight): string {
  const title = [highlight.where, highlight.color].filter(Boolean).join(" · ");
  const compact = compactLocation(highlight.location);
  const lines = [
    `> [!quote] ${title}`,
    quoteLines(highlight.selectedText),
    ...(highlight.note ? [">", quoteLines(highlight.note)] : []),
    `<!-- h: ${highlight.id}${compact ? ` ${compact}` : ""} -->`,
  ];
  return lines.join("\n");
}

function renderBlock(state: NoteState): string {
  const parts = state.highlights.map(renderHighlight);
  if (state.memo.trim()) parts.push(`## Memo\n${state.memo.trim()}`);
  return [START, ...parts, END].join("\n\n").replace(`${START}\n\n`, `${START}\n`).replace(`\n\n${END}`, `\n${END}`);
}

function parseBlock(block: string): { highlights: NoteHighlight[]; memo: string } {
  const highlights: NoteHighlight[] = [];
  const lines = block.split("\n");
  let index = 0;
  let memo = "";

  while (index < lines.length) {
    const line = lines[index];
    const callout = /^> \[!quote\]\s*(.*)$/.exec(line);
    if (callout) {
      // The quote, then optionally a bare `>` and the note, then the id.
      const quoted: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].startsWith(">")) {
        quoted.push(lines[index].replace(/^> ?/, ""));
        index += 1;
      }
      const idLine = /^<!-- h: (\S+)(?: (\S+))? -->$/.exec(lines[index] ?? "");
      if (!idLine) continue; // A callout without its id is not one of ours.
      index += 1;
      const separator = quoted.indexOf("");
      const selectedText = (separator < 0 ? quoted : quoted.slice(0, separator)).join("\n");
      const note = separator < 0 ? undefined : quoted.slice(separator + 1).join("\n");
      const location = idLine[2] ? expandLocation(idLine[2], selectedText) : null;
      if (!location || !selectedText) continue;
      const titleParts = callout[1].split(" · ").map((part) => part.trim());
      const color = titleParts.find((part): part is HighlightColor => (HIGHLIGHT_COLORS as readonly string[]).includes(part));
      const where = titleParts.filter((part) => part && part !== color).join(" · ");
      highlights.push({
        color: color ?? "yellow",
        id: idLine[1],
        location,
        selectedText,
        ...(note ? { note } : {}),
        ...(where ? { where } : {}),
      });
      continue;
    }
    if (/^## Memo\s*$/.test(line)) {
      memo = lines.slice(index + 1).join("\n").trim();
      break;
    }
    index += 1;
  }
  return { highlights, memo };
}

// ----------------------------------------------------------------- public API

export function renderNote(state: NoteState, outside: Outside): string {
  return `${renderFrontmatter(state.frontmatter)}${outside.before}${renderBlock(state)}${outside.after}`;
}

/**
 * Reads a note back, keeping whatever it does not understand.
 *
 * Tolerant by design: a line someone edited by hand inside the block is
 * skipped, not fatal, and a note with no block at all is entirely theirs.
 */
export function parseNote(markdown: string): { state: NoteState; outside: Outside } {
  const { front, body } = parseFrontmatter(markdown);
  const start = body.indexOf(START);
  const end = start >= 0 ? body.indexOf(END, start + START.length) : -1;
  if (start < 0 || end < 0) {
    return {
      outside: { after: body, before: "" },
      state: { frontmatter: front, highlights: [], memo: "" },
    };
  }
  const block = body.slice(start + START.length, end);
  const { highlights, memo } = parseBlock(block.replace(/^\n/, "").replace(/\n$/, ""));
  return {
    outside: { after: body.slice(end + END.length), before: body.slice(0, start) },
    state: { frontmatter: front, highlights, memo },
  };
}
