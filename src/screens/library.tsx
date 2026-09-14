import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { LibraryList } from "@/components/library-list";
import { navigate } from "@/router";
import { importFile, listDocuments, type StoredDocument, UnsupportedFileError } from "@/storage/documents";
import { listNotes } from "@/sync/vault-client";

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

/** A note in the vault, read off its file name. */
type VaultBook = { name: string; title: string; idPrefix: string };

function vaultBookOf(name: string): VaultBook | null {
  const match = /^(.*) \(([0-9a-f]{8})\)\.md$/.exec(name);
  return match ? { idPrefix: match[2], name, title: match[1] } : null;
}

export function LibraryScreen() {
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [elsewhere, setElsewhere] = useState<VaultBook[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listDocuments().then(setDocuments).catch(() => setDocuments([]));
    // The vault's notes, quietly: offline or unconfigured, the library is
    // simply what is on this device.
    void listNotes()
      .then((entries) => setElsewhere(entries.map((entry) => vaultBookOf(entry.name)).filter((book): book is VaultBook => book !== null)))
      .catch(() => setElsewhere([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.title = "book-reader"; }, []);

  const notHere = elsewhere.filter((book) => !documents?.some((document) => document.id.startsWith(book.idPrefix)));

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
          {notHere.length > 0 && (
            <section aria-label="In your vault" className="mt-8 space-y-3">
              <h2 className="text-xl font-semibold">In your vault, not on this device</h2>
              <p className="text-ink-quiet text-sm">
                Open the same file here to read it with its marks.
              </p>
              <ul className="space-y-2">
                {notHere.map((book) => (
                  <li className="border-rule rounded-xl border p-3" key={book.name}>
                    <span className="font-medium">{book.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      }
    />
  );
}
