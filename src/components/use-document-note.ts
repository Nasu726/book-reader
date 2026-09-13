"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DocumentNote = ReturnType<typeof useDocumentNote>;

/** The one free-text note kept with a document. */
export function useDocumentNote(documentId: string) {
  const [content, setContent] = useState("");
  // What the server is holding, so the button can say which of the two things
  // pressing it would do. Without it a document that has never had a note
  // offered to clear one.
  const [stored, setStored] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  // Typing before the saved note arrives must not be thrown away by it.
  const edited = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/documents/${documentId}/note`, { cache: "no-store" });
        if (!response.ok) throw new Error("Load failed.");
        const payload = (await response.json()) as { note?: { content?: string } | null };
        if (cancelled) return;
        setStored(payload.note?.content ?? "");
        if (!edited.current) setContent(payload.note?.content ?? "");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const save = useCallback(async (next: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/note`, {
        body: JSON.stringify({ content: next }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Save failed.");
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
