import { detectFormatFromBytes } from "@/core/documents/file-signature";
import { localDb } from "./local-db";

export type DocumentFormat = "epub" | "pdf";

/** What the library knows about a document without lifting its bytes. */
export type StoredDocument = {
  /** SHA-256 of the file, so the same file is the same document on every device. */
  id: string;
  title: string;
  /** The filename it was opened from. */
  name: string;
  format: DocumentFormat;
  size: number;
  addedAt: string;
  openedAt?: string;
};

type StoredFile = { id: string; bytes: ArrayBuffer };

export class UnsupportedFileError extends Error {
  constructor() {
    super("Only PDF and EPUB files can be opened.");
    this.name = "UnsupportedFileError";
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The filename without its extension, which is the title until a better one is known. */
export function titleFromFilename(name: string): string {
  return name.replace(/\.(epub|pdf)$/i, "").trim() || name;
}

/**
 * Keeps a file on this device and returns its document.
 *
 * Opening the same file again is not a second document: the id is the hash
 * of the bytes, so it finds the record it made before and leaves the title
 * the reader may have changed alone.
 */
export async function importFile(file: File): Promise<StoredDocument> {
  const bytes = await file.arrayBuffer();
  const format = detectFormatFromBytes(new Uint8Array(bytes));
  if (!format) throw new UnsupportedFileError();

  const id = await sha256Hex(bytes);
  const existing = await localDb.get<StoredDocument>("documents", id);
  if (existing) return existing;

  const document: StoredDocument = {
    addedAt: new Date().toISOString(),
    format,
    id,
    name: file.name,
    size: bytes.byteLength,
    title: titleFromFilename(file.name),
  };
  await localDb.put<StoredFile>("files", { bytes, id });
  await localDb.put("documents", document);
  return document;
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const documents = await localDb.list<StoredDocument>("documents");
  return documents.sort((a, b) => (b.openedAt ?? b.addedAt).localeCompare(a.openedAt ?? a.addedAt));
}

export function getDocument(id: string): Promise<StoredDocument | undefined> {
  return localDb.get<StoredDocument>("documents", id);
}

export async function getDocumentBytes(id: string): Promise<ArrayBuffer | undefined> {
  return (await localDb.get<StoredFile>("files", id))?.bytes;
}

export async function updateDocument(
  id: string,
  changes: Partial<Pick<StoredDocument, "title" | "openedAt">>,
): Promise<void> {
  const current = await localDb.get<StoredDocument>("documents", id);
  if (!current) return;
  await localDb.put("documents", { ...current, ...changes });
}

/** Removes the file and its record from this device. Notes are not touched. */
export async function removeDocument(id: string): Promise<void> {
  await localDb.delete("files", id);
  await localDb.delete("documents", id);
  await localDb.delete("progress", id);
}
