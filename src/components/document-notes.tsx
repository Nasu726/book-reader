"use client";

import { useEffect, useRef, useState } from "react";

type DocumentNotesProps = {
  documentId: string;
};

export function DocumentNotes({ documentId }: DocumentNotesProps) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/documents/${documentId}/note`, { cache: "no-store" });
        if (!response.ok) throw new Error("Load failed.");
        const payload = (await response.json()) as { note?: { content?: string } | null };
        if (!cancelled) setContent(payload.note?.content ?? "");
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) loaded.current = true;
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function save() {
    try {
      const response = await fetch(`/api/documents/${documentId}/note`, {
        body: JSON.stringify({ content }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Save failed.");
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => current === "saved" ? "idle" : current), 5000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section aria-label="Document notes" className="mt-6 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <label className="block text-sm font-medium" htmlFor="document-note">Document note</label>
      <textarea
        className="min-h-32 w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        id="document-note"
        onChange={(event) => {
          setContent(event.target.value);
          setStatus("idle");
        }}
        placeholder="Write notes about this document."
        value={content}
      />
      {status === "saved" && <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">Note saved.</p>}
      {status === "error" && (
        <div className="space-y-2 rounded-lg border border-red-300 p-3 text-sm" role="alert">
          <p>Note could not be saved or loaded.</p>
          <button className="min-h-10 rounded bg-zinc-900 px-3 font-medium text-white" onClick={() => void save()} type="button">Retry save</button>
        </div>
      )}
      <button
        className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 font-medium text-white"
        disabled={!content.trim()}
        onClick={() => void save()}
        type="button"
      >
        Save note
      </button>
    </section>
  );
}
