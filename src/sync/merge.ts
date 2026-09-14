import type { NoteState, Outside } from "@/notes/format";
import type { LocalNote, StoredHighlight } from "@/storage/notes";

export type Merged = Pick<LocalNote, "highlights" | "memo" | "status" | "extraFrontmatter"> & { outside: Outside };

/**
 * What this device and the vault agree the note is.
 *
 * Marks are a set: union by id, so a mark made on another device is kept, and
 * this device's version of a mark it also has wins (its note on it is the
 * newer edit). A mark deleted here is a tombstone, so it does not come back
 * from the vault. The memo and the status are one value each, so the newer
 * side wins: this device's if it edited them since it last synced, otherwise
 * the vault's. Everything outside the block is the reader's and comes from
 * the vault untouched.
 */
export function mergeNotes(local: LocalNote, remote: { state: NoteState; outside: Outside } | null): Merged {
  if (!remote) {
    return {
      highlights: local.highlights,
      memo: local.memo,
      outside: local.outside ?? { after: "\n", before: "" },
      status: local.status,
      ...(local.extraFrontmatter ? { extraFrontmatter: local.extraFrontmatter } : {}),
    };
  }

  const deleted = new Set(local.deleted ?? []);
  const mine = new Map(local.highlights.map((highlight) => [highlight.id, highlight]));
  const highlights: StoredHighlight[] = [];
  for (const theirs of remote.state.highlights) {
    if (deleted.has(theirs.id)) continue;
    const ours = mine.get(theirs.id);
    highlights.push(ours ?? { ...theirs, createdAt: "" });
    mine.delete(theirs.id);
  }
  for (const ours of mine.values()) highlights.push(ours);

  const editedSinceSync = local.editedAt !== undefined
    && (local.syncedAt === undefined || local.editedAt > local.syncedAt);
  const neverSynced = local.syncedAt === undefined;
  const ownWordsWin = editedSinceSync || (neverSynced && (local.memo.trim() !== "" || local.status === "done"));

  return {
    highlights,
    memo: ownWordsWin ? local.memo : remote.state.memo,
    outside: remote.outside,
    status: ownWordsWin ? local.status : remote.state.frontmatter.status,
    ...(remote.state.frontmatter.extra?.length ? { extraFrontmatter: remote.state.frontmatter.extra } : {}),
  };
}

/**
 * The file a document's note lives in: the title, made safe for every file
 * system Obsidian runs on, and the first eight characters of the id so two
 * documents with one title do not share a note.
 */
export function noteNameFor(document: { id: string; title: string }): string {
  const safe = [...document.title]
    .map((char) => (/[/\\:*?"<>|#^[\]]/.test(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return `${safe || "Untitled"} (${document.id.slice(0, 8)}).md`;
}
