import { useState } from "react";

import type { DocumentNote } from "./use-document-note";
import { VaultStatus } from "./vault-status";

/**
 * The memo, whether the book is finished, and the note as text.
 *
 * Copy as Markdown is the whole note in the vault's shape — for pasting into
 * Obsidian by hand until the vault sync exists, and after that for anyone who
 * wants to see what will be written.
 */
export function DocumentNotes({
  documentId,
  note,
  finished,
  onFinishedChange,
  renderMarkdown,
}: {
  documentId: string;
  note: DocumentNote;
  finished: boolean;
  onFinishedChange: (finished: boolean) => void;
  renderMarkdown: () => Promise<string>;
}) {
  const { content, edit, save, status, stored } = note;
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(await renderMarkdown());
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 1500);
  }

  return (
    <section aria-label="Document notes" className="space-y-3">
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="document-note">Document note</label>
        <textarea
          className="border-edge bg-field min-h-32 w-full rounded-lg border p-3 text-base"
          id="document-note"
          onChange={(event) => edit(event.target.value)}
          placeholder="Write notes about this document."
          value={content}
        />
        {status === "saved" && <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">{content.trim() ? "Note saved." : "Note cleared."}</p>}
        {status === "error" && (
          <div className="space-y-2 rounded-lg border border-red-300 p-3 text-sm" role="alert">
            <p>Note could not be saved or loaded.</p>
            <button className="min-h-10 rounded bg-ink px-3 font-medium text-white" onClick={() => void save(content)} type="button">Retry save</button>
          </div>
        )}
        {/* An empty note saves as an empty note, which is how a note gets
            removed. Disabling the button on empty text meant a note could be
            written but never taken back. */}
        <button
          className="min-h-11 w-full rounded-lg bg-ink px-4 font-medium text-white disabled:opacity-50"
          disabled={!content.trim() && !stored.trim()}
          onClick={() => void save(content)}
          type="button"
        >
          {!content.trim() && stored.trim() ? "Clear note" : "Save note"}
        </button>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          checked={finished}
          className="h-5 w-5 accent-marker"
          onChange={(event) => onFinishedChange(event.target.checked)}
          type="checkbox"
        />
        Finished reading
      </label>

      <button
        className="border-edge min-h-11 w-full rounded-lg border px-4 text-sm"
        onClick={() => void copyMarkdown()}
        type="button"
      >
        {copied === "copied" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy note as Markdown"}
      </button>

      <VaultStatus documentId={documentId} />
    </section>
  );
}
