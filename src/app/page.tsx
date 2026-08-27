import { redirect } from "next/navigation";

import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/current-session";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { AppShell } from "@/components/app-shell";
import { LibraryList } from "@/components/library-list";

export default async function Home() {
  const database = createSqliteDb();
  const session = await getCurrentUser(database);
  if (!session) {
    redirect("/login");
  }

  const libraryRepository = createSqliteLibraryRepository(createDrizzleFromSqlite(database));
  const documents = await libraryRepository.list(session.userId);

  return (
    <AppShell
      reader={
        <>
          <h1 className="text-3xl font-semibold tracking-tight">AI Reader</h1>
          <form action="/api/documents" className="mt-6 space-y-3" encType="multipart/form-data" method="post">
            <label className="block text-sm font-medium" htmlFor="document-file">Import PDF or EPUB</label>
            <input accept=".epub,.pdf,application/epub+zip,application/pdf" className="w-full" id="document-file" name="file" required type="file" />
            <button className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white" type="submit">Import</button>
          </form>
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
          <form action="/api/auth/logout" method="post">
            <button className="mt-8 min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900" type="submit">
              Log out
            </button>
          </form>
        </>
      }
    />
  );
}
