import type { HighlightColor } from "@/core/highlights/colors";
import { localDb } from "./local-db";

export type StoredHighlight = {
  id: string;
  color: HighlightColor;
  selectedText: string;
  /** Which page or chapter, and where in it — what the painter needs. */
  location: string;
  note?: string;
  createdAt: string;
};

/** What the reader wrote and marked in one document, as kept on this device. */
export type LocalNote = {
  id: string;
  highlights: StoredHighlight[];
  memo: string;
};

export async function getNote(documentId: string): Promise<LocalNote> {
  return (await localDb.get<LocalNote>("notes", documentId)) ?? { highlights: [], id: documentId, memo: "" };
}

export function putNote(note: LocalNote): Promise<void> {
  return localDb.put("notes", note);
}
