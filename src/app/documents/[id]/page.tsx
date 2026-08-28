import { SelectionAiConnector } from "@/components/selection-ai-connector";
import { notFound, redirect } from "next/navigation";

import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { getCurrentUser, usesExternalAuth } from "@/server/auth/current-session";
import { SignOut } from "@/components/sign-out";
import { getDatabase } from "@/server/db/database";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const repository = createSqliteDocumentRepository(database);
  const document = await repository.getById(id);
  if (!document || document.userId !== session.userId) {
    notFound();
  }

  await createSqliteLibraryRepository(database).markOpened(
    id,
    session.userId,
  );

  return (
    <SelectionAiConnector
      account={<SignOut usesAccess={usesExternalAuth()} />}
      documentFormat={document.format}
      documentId={id}
      documentTitle={document.title}
      documentSourceFilename={document.sourceFilename ?? undefined}
      initialHighlights={(await createSqliteHighlightRepository(
        database,
      ).listByDocument(id, session.userId)).map((highlight) => ({
        color: highlight.color,
        id: highlight.id,
        location: highlight.location,
        note: highlight.note,
        selectedText: highlight.selectedText,
      }))}
      initialVocabulary={(await createSqliteVocabularyRepository(
        database,
      ).listByDocument(id, session.userId)).map((entry) => ({
        id: entry.id,
        meaning: entry.meaning,
        sourceText: entry.sourceText,
        term: entry.term,
      }))}
    />
  );
}
