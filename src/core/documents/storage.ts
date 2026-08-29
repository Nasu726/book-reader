/**
 * Where the bytes of an imported document live.
 *
 * The reader only ever holds an opaque reference string, so the backing store
 * can be swapped (local disk today, object storage later) without touching the
 * repositories, the routes, or the UI.
 */

/** A half-open byte span, the way an HTTP Range names one. */
export type ByteRange = { start: number; end: number };

export type StoredDocumentSource = {
  contentType: string;
  /** The size of the whole document, whatever slice of it was asked for. */
  size: number;
  /** The slice this stream carries. Absent when it carries all of it. */
  range?: ByteRange;
  stream: ReadableStream<Uint8Array>;
};

export interface DocumentStorage {
  /** Persists the bytes and returns the reference to store alongside the document row. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /**
   * Resolves a reference, or null when the bytes are gone.
   *
   * A range asks for part of it. A reader opening a book does not need the
   * whole file to show the first page, and on a phone the difference is
   * between a document that opens and one that never does.
   */
  get(reference: string, range?: ByteRange): Promise<StoredDocumentSource | null>;
  /** Removes the bytes. Missing references are not an error. */
  delete(reference: string): Promise<void>;
}

/** Clamps a requested span to what the document actually holds. */
export function clampRange(range: ByteRange, size: number): ByteRange | null {
  const start = Math.max(0, Math.floor(range.start));
  const end = Math.min(size - 1, Math.floor(range.end));
  return start > end || start >= size ? null : { start, end };
}

/**
 * The span an HTTP Range header asks for, or null when it asks for nothing this
 * reader serves. Only a single span is supported: a PDF viewer never asks for
 * more, and answering a multipart range is a lot of code for nobody.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || size <= 0) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  // "bytes=-500" means the last 500 bytes.
  const range = rawStart
    ? { start: Number(rawStart), end: rawEnd ? Number(rawEnd) : size - 1 }
    : { start: size - Number(rawEnd), end: size - 1 };
  return clampRange(range, size);
}

export async function readStoredBytes(
  source: StoredDocumentSource,
): Promise<ArrayBuffer> {
  return new Response(source.stream).arrayBuffer();
}
