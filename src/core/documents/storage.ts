/**
 * Where the bytes of an imported document live.
 *
 * The reader only ever holds an opaque reference string, so the backing store
 * can be swapped (local disk today, object storage later) without touching the
 * repositories, the routes, or the UI.
 */

export type StoredDocumentSource = {
  contentType: string;
  size: number;
  stream: ReadableStream<Uint8Array>;
};

export interface DocumentStorage {
  /** Persists the bytes and returns the reference to store alongside the document row. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /** Resolves a reference, or null when the bytes are gone. */
  get(reference: string): Promise<StoredDocumentSource | null>;
  /** Removes the bytes. Missing references are not an error. */
  delete(reference: string): Promise<void>;
}

export async function readStoredBytes(
  source: StoredDocumentSource,
): Promise<ArrayBuffer> {
  return new Response(source.stream).arrayBuffer();
}
