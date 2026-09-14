import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeNotes, noteNameFor } from "../../src/sync/merge.ts";
import type { LocalNote, StoredHighlight } from "../../src/storage/notes.ts";

const mark = (id: string, text: string, extra: Partial<StoredHighlight> = {}): StoredHighlight => ({
  color: "yellow",
  createdAt: "2026-09-14T00:00:00.000Z",
  id,
  location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
  selectedText: text,
  ...extra,
});

const local = (overrides: Partial<LocalNote> = {}): LocalNote => ({
  highlights: [],
  id: "doc",
  memo: "",
  status: "reading",
  ...overrides,
});

test("marks are the union by id: what another device added is kept, what this one deleted stays deleted", () => {
  const merged = mergeNotes(
    local({ deleted: ["gone"], highlights: [mark("mine", "Mine"), mark("both", "Both, with my note", { note: "my note" })] }),
    {
      outside: { after: "\n", before: "" },
      state: {
        frontmatter: { added: "2026-09-14", status: "reading", tags: ["book-reader"], title: "T" },
        highlights: [
          { color: "green", id: "theirs", location: JSON.stringify({ page: 2, source: "text-layer-viewport", version: 1 }), selectedText: "Theirs", where: "p.2" },
          { color: "yellow", id: "both", location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }), selectedText: "Both, with my note" },
          { color: "pink", id: "gone", location: JSON.stringify({ page: 3, source: "text-layer-viewport", version: 1 }), selectedText: "Deleted here" },
        ],
        memo: "",
      },
    },
  );
  assert.deepEqual(merged.highlights.map((h) => h.id), ["theirs", "both", "mine"]);
  assert.equal(merged.highlights.find((h) => h.id === "both")?.note, "my note");
  assert.equal(merged.highlights.find((h) => h.id === "theirs")?.where, "p.2");
});

test("the memo and the status: this device's when it edited since the last sync, the vault's otherwise", () => {
  const remote = {
    outside: { after: "\n\nTheir text.\n", before: "" },
    state: {
      frontmatter: { added: "2026-09-14", extra: ["rating: 5"], status: "done" as const, tags: ["book-reader"], title: "T" },
      highlights: [],
      memo: "Written elsewhere.",
    },
  };
  // A fresh device with nothing of its own takes what the vault has.
  const fresh = mergeNotes(local(), remote);
  assert.equal(fresh.memo, "Written elsewhere.");
  assert.equal(fresh.status, "done");
  assert.deepEqual(fresh.outside, remote.outside);
  assert.deepEqual(fresh.extraFrontmatter, ["rating: 5"]);

  // Edited here after the last sync: this device's memo wins, even an empty one.
  const edited = mergeNotes(local({ editedAt: "2026-09-14T10:00:00Z", memo: "", status: "reading", syncedAt: "2026-09-14T09:00:00Z" }), remote);
  assert.equal(edited.memo, "");
  assert.equal(edited.status, "reading");

  // Synced since the last edit: the vault's memo wins.
  const stale = mergeNotes(local({ editedAt: "2026-09-14T08:00:00Z", memo: "Old local.", syncedAt: "2026-09-14T09:00:00Z" }), remote);
  assert.equal(stale.memo, "Written elsewhere.");
});

test("with nothing in the vault, the note is this device's as it is", () => {
  const merged = mergeNotes(local({ highlights: [mark("a", "A")], memo: "Mine.", status: "done" }), null);
  assert.deepEqual(merged.highlights.map((h) => h.id), ["a"]);
  assert.equal(merged.memo, "Mine.");
  assert.equal(merged.status, "done");
  assert.deepEqual(merged.outside, { after: "\n", before: "" });
});

test("a note's file name is the title, made safe, with enough of the id to be unique", () => {
  assert.equal(noteNameFor({ id: "8f2a1c3d9e".padEnd(64, "0"), title: "Attention Is All You Need" }), "Attention Is All You Need (8f2a1c3d).md");
  assert.equal(noteNameFor({ id: "8f2a1c3d9e".padEnd(64, "0"), title: 'A/B: "C" <D> | E?' }), "A B C D E (8f2a1c3d).md");
  assert.equal(noteNameFor({ id: "8f2a1c3d9e".padEnd(64, "0"), title: "   " }), "Untitled (8f2a1c3d).md");
  assert.equal(noteNameFor({ id: "8f2a1c3d9e".padEnd(64, "0"), title: "x".repeat(300) }).length, `${"x".repeat(120)} (8f2a1c3d).md`.length);
});
