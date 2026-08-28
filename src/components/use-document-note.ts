"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DocumentNote = ReturnType<typeof useDocumentNote>;

/**
 * The one free-text note kept with a document.
 *
 * Lifted out of the panel that shows it so that an answer can be kept from the
 * conversation without the two copies of the note disagreeing about what it
 * says.
 */
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

  // The value to save is passed in rather than read from state: appending sets
  // the text and saves it in the same breath, and state has not settled yet.
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

  /** Keeps an answer, under whatever is already written. */
  const append = useCallback(async (text: string) => {
    const addition = text.trim();
    if (!addition) return;
    edited.current = true;
    const next = content.trim() ? `${content.trim()}\n\n---\n\n${addition}` : addition;
    setContent(next);
    await save(next);
  }, [content, save]);

  const edit = useCallback((next: string) => {
    edited.current = true;
    setContent(next);
    setStatus("idle");
  }, []);

  return { append, content, edit, save, status, stored };
}
