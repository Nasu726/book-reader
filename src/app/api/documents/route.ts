import { randomUUID } from "node:crypto";

import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase } from "@/server/db/database";
import { detectFormatFromBytes } from "@/core/documents/file-signature";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { getDocumentStorage } from "@/server/storage";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, "epub" | "pdf"> = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
};

export async function GET() {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const repository = createSqliteLibraryRepository(database);
  return Response.json({ documents: await repository.list(session.userId) });
}

export async function POST(request: Request) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let file: File;
  let storageError: unknown;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return Response.json({ error: "The file must be between 1 byte and 100 MB." }, { status: 413 });
  }

  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      throw new Error("A PDF or EPUB file is required.");
    }
    file = candidate;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid upload." },
      { status: 400 },
    );
  }

  const format = ALLOWED_TYPES[file.type];
  if (!format) {
    return Response.json({ error: "Only PDF and EPUB files are supported." }, { status: 415 });
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "The file must be between 1 byte and 100 MB." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The declared Content-Type is client-supplied; the bytes have to agree.
  if (detectFormatFromBytes(bytes) !== format) {
    return Response.json(
      { error: "The file contents do not match a PDF or EPUB document." },
      { status: 415 },
    );
  }
  // The title starts as the filename. For EPUBs the reader replaces it with the
  // book's own title once it parses the file in the browser: parsing here would
  // pull epub-ts and a server DOM into a Cloudflare Worker that has 10ms of CPU
  // and a 3 MiB bundle to work with.
  const filenameTitle = file.name.replace(/\.(epub|pdf)$/i, "") || file.name;
  const repository = createSqliteLibraryRepository(database);
  const storage = getDocumentStorage();
  const documentId = randomUUID();
  let storedReference: string | undefined;
  try {
    await repository.create({
      id: documentId,
      userId: session.userId,
      title: filenameTitle,
      format,
      sourceFilename: file.name,
    });

    storedReference = await storage.put(documentId, bytes, file.type);
    const stored = await repository.updateSourceIfOwned(
      documentId,
      session.userId,
      storedReference,
    );
    if (!stored) {
      throw new Error("Document disappeared before its source was stored.");
    }
  } catch (error) {
    storageError = error;
    if (storedReference) await storage.delete(storedReference).catch(() => undefined);
    await repository.delete(documentId, session.userId);
    console.error(storageError instanceof Error ? storageError.message : storageError);
    return Response.json({ error: "Failed to store the document." }, { status: 500 });
  }

  return new Response(null, {
    headers: { location: "/" },
    status: 303,
  });
}
