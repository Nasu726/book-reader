import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ReaderWorkbench } from "@/components/reader-workbench";
import { getDocument, getDocumentBytes, type StoredDocument, updateDocument } from "@/storage/documents";

type Opened =
  | { state: "opening" }
  | { state: "missing" }
  | { state: "ready"; document: StoredDocument; bytes: ArrayBuffer };

/** Loads a document from this device and hands it to the reader. */
export function ReaderScreen({ id }: { id: string }) {
  const [opened, setOpened] = useState<Opened>({ state: "opening" });

  useEffect(() => {
    let cancelled = false;
    async function open() {
      const [document, bytes] = await Promise.all([getDocument(id), getDocumentBytes(id)]);
      if (cancelled) return;
      if (!document || !bytes) {
        setOpened({ state: "missing" });
        return;
      }
      setOpened({ bytes, document, state: "ready" });
      void updateDocument(id, { openedAt: new Date().toISOString() });
    }
    void open().catch(() => { if (!cancelled) setOpened({ state: "missing" }); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (opened.state === "ready") document.title = `${opened.document.title} — book-reader`;
  }, [opened]);

  if (opened.state === "ready") {
    return <ReaderWorkbench bytes={opened.bytes} document={opened.document} />;
  }

  return (
    <AppShell
      title={
        <div className="min-w-0">
          <a className="text-sm text-ink-quiet hover:underline" href="/">← Library</a>
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {opened.state === "opening" ? "Opening…" : "Not on this device"}
          </h1>
        </div>
      }
      reader={
        opened.state === "opening"
          ? <p aria-live="polite" className="text-ink-quiet">Opening…</p>
          : (
            <div className="max-w-prose space-y-3" role="alert">
              <p>This document is not on this device.</p>
              <p className="text-ink-quiet text-sm">
                Open the same file here to read it. Your marks and notes are kept in your vault.
              </p>
              <a className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white" href="/">
                Back to the library
              </a>
            </div>
          )
      }
    />
  );
}
