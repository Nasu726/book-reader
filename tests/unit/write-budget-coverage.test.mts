import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

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
test("every write route charges the daily budget", () => {
  const missing: string[] = [];
  let checked = 0;

  const entries = readdirSync(API_DIR, { recursive: true }) as string[];
  for (const entry of entries) {
    const name = entry.replaceAll("\\", "/");
    if (!name.endsWith("route.ts") || EXEMPT.includes(name)) continue;

    const source = readFileSync(join(API_DIR, entry), "utf8");
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
