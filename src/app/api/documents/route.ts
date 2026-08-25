import { randomUUID } from "node:crypto";

import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createSqliteDb } from "@/server/db/client";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { cookies } from "next/headers";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, "epub" | "pdf"> = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
};

export async function GET() {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const repository = createSqliteLibraryRepository(createDrizzleFromSqlite(database));
  return Response.json({ documents: await repository.list(session.userId) });
}

export async function POST(request: Request) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let file: File;
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

  const fileData = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  const title = file.name.replace(/\.(epub|pdf)$/i, "") || file.name;
  const repository = createSqliteLibraryRepository(createDrizzleFromSqlite(database));
  const documentId = randomUUID();
  await repository.create({
    id: documentId,
    userId: session.userId,
    title,
    format,
    sourceFilename: file.name,
  });

  await repository.updateSource(documentId, session.userId, fileData);

  return new Response(null, {
    headers: { location: "/" },
    status: 303,
  });
}
