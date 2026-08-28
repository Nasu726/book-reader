import { redirect } from "next/navigation";

import { getCurrentUser, usesExternalAuth } from "@/server/auth/current-session";
import { getDatabase } from "@/server/db/database";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { AppShell } from "@/components/app-shell";
import { ImportDocument } from "@/components/import-document";
import { SignOut } from "@/components/sign-out";
import { LibraryList } from "@/components/library-list";

export default async function Home() {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    redirect("/login");
  }

  const libraryRepository = createSqliteLibraryRepository(database);
  const documents = await libraryRepository.list(session.userId);

  return (
    <AppShell
      title={<h1 className="text-lg font-semibold tracking-tight">AI Reader</h1>}
      account={<SignOut usesAccess={usesExternalAuth()} />}
      reader={
        <>
          <ImportDocument />
          <section aria-label="Library" className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">Library</h2>
            <LibraryList
              documents={documents.map((document) => ({
                id: document.id,
                title: document.title,
                format: document.format,
                lastOpenedAt: document.lastOpenedAt?.toISOString(),
              }))}
            />
          </section>
        </>
      }
    />
  );
}
