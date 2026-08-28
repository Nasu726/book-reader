"use client";

import { useRef, useState } from "react";

/**
 * Adds a book to the library.
 *
 * One button, one step. The form this replaces showed a bare file input styled
 * as body text, so it did not read as something to click, and the Import button
 * next to it did nothing until a file had already been chosen — the opposite of
 * what a button labelled Import leads you to expect. Now the button opens the
 * file picker and the upload starts as soon as a file is chosen.
 */
export function ImportDocument() {
  const formRef = useRef<HTMLFormElement>(null);
  const [busyWith, setBusyWith] = useState<string | null>(null);

  return (
    <form
      action="/api/documents"
      encType="multipart/form-data"
      method="post"
      ref={formRef}
    >
      <input
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        aria-label="Import PDF or EPUB"
        className="sr-only"
        id="document-file"
        name="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusyWith(file.name);
          formRef.current?.submit();
        }}
        required
        type="file"
      />
      {/* A label, not a button: it opens the file picker through the browser
          rather than through a click handler, so it works from the moment the
          markup arrives instead of once React has hydrated. */}
      <label
        className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-ink px-4 font-medium text-white"
        htmlFor="document-file"
      >
        {busyWith ? `Adding ${busyWith}…` : "Add a book"}
      </label>
      <p className="mt-2 text-sm text-ink-quiet">
        PDF or EPUB, up to 100 MB.
      </p>
    </form>
  );
}
