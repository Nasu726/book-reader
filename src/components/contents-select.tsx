"use client";

/**
 * The document's contents, as one native control.
 *
 * A select rather than a panel of links: it is one tap on a phone, it scrolls
 * a long list by itself, it takes no room beside the page number, and closed
 * it shows the heading the reader is under — so it doubles as "you are here".
 * The entries come from the document (a PDF's outline, an EPUB's navigation),
 * never from guessing at headings.
 */
export function ContentsSelect({
  entries,
  current,
  onPick,
  className = "max-w-44 sm:max-w-72",
}: {
  entries: readonly { label: string; depth?: number }[];
  /** Index of the entry the reader is under, or -1 before the first one. */
  current: number;
  onPick: (index: number) => void;
  /** How much of the row it may take; the toolbars differ. */
  className?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <select
      aria-label="Contents"
      className={`border-edge bg-field text-ink min-h-11 rounded-lg border px-2 text-base ${className}`}
      onChange={(event) => onPick(Number(event.target.value))}
      value={current}
    >
      {current < 0 && <option value={-1}>Contents</option>}
      {entries.map((entry, index) => (
        // An em space per level, which unlike an ordinary space survives the
        // whitespace collapsing inside an option.
        <option key={index} value={index}>
          {" ".repeat(entry.depth ?? 0)}{entry.label}
        </option>
      ))}
    </select>
  );
}
