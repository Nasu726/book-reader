import { useSyncExternalStore } from "react";

import { parseNote, renderNote } from "@/notes/format";
import { getDocument } from "@/storage/documents";
import { localDb } from "@/storage/local-db";
import { getNote as getLocalNote, noteStateOf, type LocalNote } from "@/storage/notes";
import { mergeNotes, noteNameFor } from "./merge";
import { getNote as getVaultNote, putNote as putVaultNote, VaultUnavailableError } from "./vault-client";

/**
 * Local first, vault second.
 *
 * Every write to a note lands in this device's store at once and puts the
 * document in an outbox. A little later — or when the connection comes
 * back, or when asked — the outbox is flushed: each note is read from the
 * vault, merged with what is here, rendered, and written back over the
 * version that was read. A conflict means someone wrote in between; the
 * merge is done again on their version, once.
 */

export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "synced"; at: string }
  | { state: "waiting"; reason: string }
  | { state: "unavailable"; reason: string };

/** Long enough to gather a burst of marks into one commit. */
const SYNC_DELAY_MS = 30_000;

let status: SyncStatus = { state: "idle" };
/** How many runs have finished, so a caller can tell a fresh result from a stale one. */
let runs = 0;
const listeners = new Set<() => void>();
let timer: number | undefined;

function setStatus(next: SyncStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => status,
    () => status,
  );
}

export function useSyncRuns(): number {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => runs,
    () => runs,
  );
}

type OutboxEntry = { id: string; queuedAt: string };

/** Notes this device has changed and the vault has not yet seen. */
export async function markDirty(documentId: string): Promise<void> {
  await localDb.put<OutboxEntry>("outbox", { id: documentId, queuedAt: new Date().toISOString() });
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), SYNC_DELAY_MS);
}

/**
 * Brings one document's note and the vault's copy into agreement.
 *
 * Returns what was decided so a caller can show it; throws only when the
 * vault cannot be reached at all.
 */
export async function syncDocument(documentId: string): Promise<"written" | "unchanged" | "skipped"> {
  const [document, local] = await Promise.all([getDocument(documentId), getLocalNote(documentId)]);
  if (!document) return "skipped";
  const name = local.remoteName ?? noteNameFor(document);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remote = await getVaultNote(name);
    const merged = mergeNotes(local, remote ? parseNote(remote.text) : null);
    const settled: LocalNote = {
      ...local,
      ...merged,
      remoteName: name,
      ...(remote ? { remoteSha: remote.sha } : {}),
    };
    const text = renderNote(noteStateOf(document, settled), merged.outside);

    if (remote && text === remote.text) {
      await localDb.put("notes", { ...settled, syncedAt: new Date().toISOString() });
      await localDb.delete("outbox", documentId);
      return "unchanged";
    }

    const marks = settled.highlights.length;
    const written = await putVaultNote(
      name,
      text,
      remote?.sha,
      `reader: ${document.title} (${marks} mark${marks === 1 ? "" : "s"})`,
    );
    if (written === "conflict") continue;

    await localDb.put("notes", { ...settled, remoteSha: written.sha, syncedAt: new Date().toISOString() });
    await localDb.delete("outbox", documentId);
    return "written";
  }
  throw new VaultUnavailableError(409);
}

/**
 * Sends everything in the outbox, one note at a time — and, when asked,
 * one more: the document in front of the reader, so what another device
 * marked arrives even when nothing changed here.
 *
 * Calls are run one after another, never merged: a Sync now pressed while
 * the sync that opening the book started is still in flight must see the
 * mark made in between, not ride on the earlier run's result.
 */
let chain: Promise<void> = Promise.resolve();

export function flush(options: { include?: string } = {}): Promise<void> {
  const run = chain.then(() => runFlush(options));
  chain = run.catch(() => undefined);
  return run;
}

async function runFlush(options: { include?: string }): Promise<void> {
  window.clearTimeout(timer);
  const pending = await localDb.list<OutboxEntry>("outbox");
  const ids = pending.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)).map((entry) => entry.id);
  if (options.include && !ids.includes(options.include)) ids.push(options.include);
  if (ids.length === 0) {
    if (status.state !== "synced") setStatus({ state: "idle" });
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus({ reason: "Offline — will sync when the connection is back.", state: "waiting" });
    return;
  }
  setStatus({ state: "syncing" });
  try {
    for (const id of ids) await syncDocument(id);
    runs += 1;
    setStatus({ at: new Date().toISOString(), state: "synced" });
  } catch (cause) {
    const unavailable = cause instanceof VaultUnavailableError;
    runs += 1;
    setStatus(unavailable && cause.status === 503
      ? { reason: cause.message, state: "unavailable" }
      : { reason: unavailable ? cause.message : "The vault could not be reached.", state: "waiting" });
  }
}

/** Wires the outbox to the connection: on start, and whenever it comes back. */
export function startSync(): () => void {
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);
  const initial = window.setTimeout(() => void flush(), 1_500);
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearTimeout(initial);
  };
}
