import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const REPOSITORY_DIR = join(import.meta.dirname, "../../src/repositories/sqlite");

/**
 * The repositories run against two drivers: better-sqlite3 locally and D1 on
 * Cloudflare. Drizzle's query builders are promises on both, so the awaited
 * builder API behaves identically — but the synchronous terminators and the
 * better-sqlite3 row count do not exist on D1, and a query using them fails
 * only once deployed.
 */
const DRIVER_SPECIFIC = [
  { pattern: /\.all\(\)/, name: ".all()", instead: "await the query builder" },
  { pattern: /\.get\(\)/, name: ".get()", instead: "await …limit(1) and read [0]" },
  { pattern: /\.run\(\)/, name: ".run()", instead: "await the query builder" },
  { pattern: /\.changes\b/, name: ".changes", instead: "await …returning() and check length" },
];

test("repositories use only the query API both drivers share", () => {
  const offences: string[] = [];

  for (const file of readdirSync(REPOSITORY_DIR)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(REPOSITORY_DIR, file), "utf8");
    source.split("\n").forEach((line, index) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      for (const { pattern, name, instead } of DRIVER_SPECIFIC) {
        if (pattern.test(line)) {
          offences.push(`${file}:${index + 1} uses ${name}; ${instead}`);
        }
      }
    });
  }

  assert.deepEqual(offences, []);
});
