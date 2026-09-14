import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { LibraryList } from "@/components/library-list";
import { navigate } from "@/router";
import { importFile, listDocuments, type StoredDocument, UnsupportedFileError } from "@/storage/documents";

/**
 * Opens a book from this device.
 *
 * Choosing the file is the whole gesture: it is hashed, kept, and opened in
 * the reader in one step. There is no upload — the bytes stay here — and no
 * server to wait for.
 */
function OpenFile({ onError }: { onError: (message: string | null) => void }) {
  const [busyWith, setBusyWith] = useState<string | null>(null);

  return (
    <div>
      <input
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        aria-label="Open PDF or EPUB"
        className="sr-only"
        id="document-file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusyWith(file.name);
          onError(null);
          try {
            const document = await importFile(file);
            navigate({ id: document.id, screen: "read" });
          } catch (cause) {
            onError(cause instanceof UnsupportedFileError
              ? cause.message
              : "The file could not be opened on this device.");
            setBusyWith(null);
            event.target.value = "";
          }
        }}
        type="file"
      />
      <label
        className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-ink px-4 font-medium text-white"
        htmlFor="document-file"
      >
        {busyWith ? `Opening ${busyWith}…` : "Open a file"}
      </label>
      <p className="mt-2 text-sm text-ink-quiet">
        PDF or EPUB. The file stays on this device; what you mark and write goes to your vault.
      </p>
    </div>
  );
}

export function LibraryScreen() {
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listDocuments().then(setDocuments).catch(() => setDocuments([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.title = "book-reader"; }, []);

  return (
    <AppShell
      title={<h1 className="text-lg font-semibold tracking-tight">book-reader</h1>}
      reader={
        <>
          <OpenFile onError={setError} />
          {error && (
            <p className="mt-3 rounded-lg border border-red-300 p-3 text-sm" role="alert">{error}</p>
          )}
          <section aria-label="Library" className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">On this device</h2>
            {documents === null
              ? <p aria-live="polite" className="text-ink-quiet">Opening…</p>
              : <LibraryList documents={documents} onChange={reload} />}
          </section>
        </>
      }
    />
  );
}
