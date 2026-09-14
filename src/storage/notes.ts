import type { HighlightColor } from "@/core/highlights/colors";
import type { NoteState, Outside } from "@/notes/format";
import type { StoredDocument } from "./documents";
import { localDb } from "./local-db";

export type StoredHighlight = {
  id: string;
  color: HighlightColor;
  selectedText: string;
  /** Which page or chapter, and where in it — what the painter needs. */
  location: string;
  note?: string;
  /** Where it is, for a person: "p.3", "§Introduction". */
  where?: string;
  createdAt: string;
};

/** What the reader wrote and marked in one document, as kept on this device. */
export type LocalNote = {
  id: string;
  highlights: StoredHighlight[];
  memo: string;
  status: "reading" | "done";
  /**
   * The reader's own text around the managed block, and any properties they
   * added, as last read from the vault. Kept so a rewrite carries them.
   */
  outside?: Outside;
  extraFrontmatter?: string[];
  /** Ids of marks removed here, so the vault's copy does not come back. */
  deleted?: string[];
  /** When the memo or the status was last changed here. */
  editedAt?: string;
  /** When this device last agreed with the vault, and on which version. */
  syncedAt?: string;
  remoteName?: string;
  remoteSha?: string;
};

export async function getNote(documentId: string): Promise<LocalNote> {
  const stored = await localDb.get<LocalNote>("notes", documentId);
  return stored ?? { highlights: [], id: documentId, memo: "", status: "reading" };
}

/** Writes a note on this device and queues it for the vault. */
export async function putNote(note: LocalNote): Promise<void> {
  await localDb.put("notes", note);
  const { markDirty } = await import("@/sync/sync");
  await markDirty(note.id);
}

/** The note as the vault will see it: the document's facts and the reader's marks. */
export function noteStateOf(document: StoredDocument, note: LocalNote): NoteState {
  return {
    frontmatter: {
      added: document.addedAt.slice(0, 10),
      status: note.status,
      tags: ["book-reader"],
      title: document.title,
      ...(note.extraFrontmatter?.length ? { extra: note.extraFrontmatter } : {}),
    },
    highlights: note.highlights.map(({ color, id, location, note: text, selectedText, where }) => ({
      color,
      id,
      location,
      selectedText,
      ...(text ? { note: text } : {}),
      ...(where ? { where } : {}),
    })),
    memo: note.memo,
  };
}
