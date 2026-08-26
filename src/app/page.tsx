import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAuthService } from "@/server/auth/service";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { AppShell } from "@/components/app-shell";

export default async function Home() {
  const database = createSqliteDb();
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
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
            {documents.length === 0 ? (
              <p className="max-w-prose text-zinc-600 dark:text-zinc-400">
                No documents yet. Import a PDF or EPUB to start reading.
              </p>
            ) : (
              <ul className="space-y-3">
                {documents.map((document) => (
                  <li key={document.id}>
                    <a
                      className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                      href={`/documents/${document.id}`}
                    >
                      <span className="font-medium">{document.title}</span>
                      <span className="ml-2 text-sm uppercase text-zinc-500">{document.format}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form action="/api/auth/logout" method="post">
            <button className="mt-8 rounded-lg bg-zinc-900 px-4 py-2 text-white" type="submit">
              Log out
            </button>
          </form>
        </>
      }
    />
  );
}
