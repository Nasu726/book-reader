"use client";

import type { DocumentNote } from "./use-document-note";

export function DocumentNotes({ note }: { note: DocumentNote }) {
  const { content, edit, save, status, stored } = note;

  return (
    <section aria-label="Document notes" className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <label className="block text-sm font-medium" htmlFor="document-note">Document note</label>
      <textarea
        className="min-h-32 w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        id="document-note"
        onChange={(event) => edit(event.target.value)}
        placeholder="Write notes about this document."
        value={content}
      />
      {status === "saved" && <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">{content.trim() ? "Note saved." : "Note cleared."}</p>}
      {status === "error" && (
        <div className="space-y-2 rounded-lg border border-red-300 p-3 text-sm" role="alert">
          <p>Note could not be saved or loaded.</p>
          <button className="min-h-10 rounded bg-zinc-900 px-3 font-medium text-white" onClick={() => void save(content)} type="button">Retry save</button>
        </div>
      )}
      {/* An empty note saves as an empty note, which is how a note gets
          removed. Disabling the button on empty text meant a note could be
          written but never taken back. */}
      <button
        className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        disabled={!content.trim() && !stored.trim()}
        onClick={() => void save(content)}
        type="button"
      >
        {!content.trim() && stored.trim() ? "Clear note" : "Save note"}
      </button>
    </section>
  );
}
