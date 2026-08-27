import { cookies } from "next/headers";
import { SelectionAiConnector } from "@/components/selection-ai-connector";
import { notFound, redirect } from "next/navigation";

import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const database = createSqliteDb();
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
    <SelectionAiConnector
      documentFormat={document.format}
      documentId={id}
      documentTitle={document.title}
      documentSourceFilename={document.sourceFilename ?? undefined}
      initialHighlights={(await createSqliteHighlightRepository(
        createDrizzleFromSqlite(database),
      ).listByDocument(id, session.userId)).map((highlight) => ({
        id: highlight.id,
        note: highlight.note,
        selectedText: highlight.selectedText,
      }))}
      initialVocabulary={(await createSqliteVocabularyRepository(
        createDrizzleFromSqlite(database),
      ).listByDocument(id, session.userId)).map((entry) => ({
        id: entry.id,
        meaning: entry.meaning,
        sourceText: entry.sourceText,
        term: entry.term,
      }))}
    />
  );
}
