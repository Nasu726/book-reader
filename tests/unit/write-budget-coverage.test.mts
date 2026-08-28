import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { glob } from "node:fs/promises";

const API_DIR = join(import.meta.dirname, "../../src/app/api");

/**
 * Sign-in and sign-out write a session row and must never be refused: a guard
 * that can lock someone out of the application it is guarding is worse than the
 * quota it protects. Nothing else belongs on this list.
 */
const EXEMPT = ["auth/login/route.ts", "auth/logout/route.ts"];

const WRITE_METHOD = /^export async function (POST|PATCH|PUT|DELETE)\(/;

/**
 * Every route that writes has to charge the day's budget, and the way that
 * stops being true is a new route added without the call. Reading the source is
 * the only check that fails for a route nobody wrote a test for yet.
 */
test("every write route charges the daily budget", async () => {
  const missing: string[] = [];
  let checked = 0;

  for await (const file of glob(join(API_DIR, "**/route.ts"))) {
    const name = relative(API_DIR, file).replaceAll("\\", "/");
    if (EXEMPT.includes(name)) continue;

    const source = readFileSync(file, "utf8");
    for (const handler of source.split(/(?=export async function )/)) {
      const method = handler.match(WRITE_METHOD)?.[1];
      if (!method) continue;
      checked += 1;
      if (!handler.includes("chargeWrite(")) missing.push(`${name} ${method}`);
    }
  }

  assert.ok(checked >= 10, `only ${checked} write handlers were scanned; the scan is not finding them`);
  assert.deepEqual(missing, []);
});
