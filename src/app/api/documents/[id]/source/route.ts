
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase } from "@/server/db/database";
import { getDocumentStorage } from "@/server/storage";
import { parseRangeHeader } from "@/core/documents/storage";

const CONTENT_TYPES = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
} as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const source = await createSqliteLibraryRepository(
    database,
  ).getSource(id, session.userId);
  if (!source) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const storage = await getDocumentStorage();

  // Asked for in pieces, the reader never holds the whole book at once.
  //
  // A phone opening a large PDF used to download every byte and keep it in one
  // buffer before a single page could be drawn; iOS would run out of room and
  // reload the tab, which looks from the outside like a document that loads for
  // ever. Answering ranges lets the viewer fetch the few kilobytes it needs.
  const wholeDocument = await storage.get(source.data);
  if (!wholeDocument) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  const wanted = parseRangeHeader(request.headers.get("range"), wholeDocument.size);

  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-type": CONTENT_TYPES[source.format] ?? wholeDocument.contentType,
    "x-content-type-options": "nosniff",
  };

  if (!wanted) {
    // Streamed as bytes: a base64 payload would cost a third more transfer and
    // force the whole document through memory on both ends.
    return new Response(wholeDocument.stream, {
      headers: { ...headers, "content-length": String(wholeDocument.size) },
    });
  }

  // The full stream was only opened to learn the size; the slice is a separate
  // read, and leaving the first one unread would hold the connection open.
  await wholeDocument.stream.cancel();
  const slice = await storage.get(source.data, wanted);
  if (!slice?.range) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  return new Response(slice.stream, {
    headers: {
      ...headers,
      "content-length": String(slice.range.end - slice.range.start + 1),
      "content-range": `bytes ${slice.range.start}-${slice.range.end}/${slice.size}`,
    },
    status: 206,
  });
}
