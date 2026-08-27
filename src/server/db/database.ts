import { isCloudflareWorker } from "@/server/runtime";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

/**
 * A database the repositories can talk to.
 *
 * Typed as the asynchronous shape, which both drivers satisfy in practice:
 * drizzle's query builders are promises, so `await db.select()...` behaves the
 * same on better-sqlite3 and on D1. Repositories must therefore stay on the
 * awaited builder API — the synchronous `.all()`, `.get()`, `.run()` and the
 * `changes` count exist only on better-sqlite3 and do not survive D1.
 */
export type Db = BaseSQLiteDatabase<"async", unknown, typeof schema>;

/** The first argument drizzle's D1 driver takes — Cloudflare's D1Database. */
type D1Binding = Parameters<typeof drizzleD1>[0];

/**
 * The D1 binding, when running on Cloudflare.
 *
 * A Worker receives its bindings per request rather than through the
 * environment, so the Cloudflare entry point hands the database in here rather
 * than this module reaching for it.
 */
let configured: Db | null = null;

export function setD1Database(binding: D1Binding): void {
  configured = drizzleD1(binding, { schema });
}

/**
 * Supplies the local SQLite database.
 *
 * Named `set…` rather than `use…` so it is not mistaken for a React hook.
 * Called from instrumentation.ts at server start. Injected rather than imported
 * here because better-sqlite3 is a native addon: a Cloudflare Worker cannot
 * load it, and merely importing this module must not try to.
 */
export function setLocalDatabase(database: Db): void {
  configured = database;
}

/**
 * The database for this request.
 *
 * D1 when the Cloudflare entry point supplied a binding, otherwise the local
 * SQLite file, opened on first use. Callers never learn which one, and never
 * assemble a driver themselves.
 *
 * The local driver is reached through a dynamic import rather than a top-level
 * one because better-sqlite3 is a native addon: a Cloudflare Worker cannot load
 * it, and on Cloudflare this branch is never taken. It is also not injected at
 * start-up, because Next.js does not guarantee that instrumentation.ts and a
 * route handler share module state.
 */
export async function getDatabase(): Promise<Db> {
  if (configured) return configured;

  const binding = await readCloudflareBinding();
  if (binding) {
    setD1Database(binding);
    return configured!;
  }

  const { createDb, getDatabasePath } = await import("./client");
  configured = createDb(getDatabasePath());
  return configured;
}

/**
 * The D1 binding, when this is running on Cloudflare.
 *
 * A Worker receives bindings per request rather than through the environment,
 * so they come from the request context rather than from process.env. Absent
 * everywhere else, which is how the local driver gets chosen.
 */
async function readCloudflareBinding(): Promise<D1Binding | null> {
  if (!isCloudflareWorker()) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as
      Record<string, unknown>;
    const binding = env.DB;
    return binding ? (binding as D1Binding) : null;
  } catch {
    return null;
  }
}

/** True once an entry point has supplied a driver. */
export function hasDatabase(): boolean {
  return configured !== null;
}

/** Exposed for tests, which need each case to start from a clean selection. */
export function resetDatabaseSelection(): void {
  configured = null;
}
