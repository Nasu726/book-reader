import { useCallback, useEffect, useRef, useState } from "react";

import { getNote, putNote } from "@/storage/notes";

export type DocumentNote = ReturnType<typeof useDocumentNote>;

/** The one free-text note kept with a document. */
export function useDocumentNote(documentId: string) {
  const [content, setContent] = useState("");
  // What is stored, so the button can say which of the two things pressing
  // it would do. Without it a document that has never had a note offered to
  // clear one.
  const [stored, setStored] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  // Typing before the stored note arrives must not be overwritten by it.
  const edited = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getNote(documentId).then((note) => {
      if (cancelled) return;
      setStored(note.memo);
      if (!edited.current) setContent(note.memo);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [documentId]);

  const save = useCallback(async (next: string) => {
    try {
      const note = await getNote(documentId);
      await putNote({ ...note, memo: next });
      setStored(next);
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => current === "saved" ? "idle" : current), 5000);
    } catch {
      setStatus("error");
    }
  }, [documentId]);

  const edit = useCallback((next: string) => {
    edited.current = true;
    setContent(next);
    setStatus("idle");
  }, []);

  return { content, edit, save, status, stored };
}
