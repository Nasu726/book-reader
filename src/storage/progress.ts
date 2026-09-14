import { localDb } from "./local-db";

/**
 * Where the reader was, on this device only.
 *
 * Not synced: the book's bytes are on this device and no other, so a position
 * in it means nothing elsewhere, and saving it every few seconds would fill a
 * vault's history with noise.
 */
export async function getProgress(documentId: string): Promise<string | null> {
  const record = await localDb.get<{ id: string; location: string }>("progress", documentId);
  return record?.location ?? null;
}

export function saveProgress(documentId: string, location: string): Promise<void> {
  return localDb.put("progress", { id: documentId, location });
}
