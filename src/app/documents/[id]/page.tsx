import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { DocumentReader } from "@/components/document-reader";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const repository = createSqliteDocumentRepository(createDrizzleFromSqlite(database));
  const document = await repository.getById(id);
  if (!document || document.userId !== session.userId) {
    notFound();
  }

  await createSqliteLibraryRepository(createDrizzleFromSqlite(database)).markOpened(
    id,
    session.userId,
  );

  return (
    <main className="space-y-6">
      <Link className="inline-block text-sm" href="/">Back to library</Link>
      <h1 className="text-3xl font-semibold tracking-tight">{document.title}</h1>
      <DocumentReader documentId={id} format={document.format} />
    </main>
  );
}
