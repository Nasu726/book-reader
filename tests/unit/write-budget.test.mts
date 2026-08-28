import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import { chargeWrite, dailyWriteBudget, DEFAULT_DAILY_WRITE_BUDGET } from "../../src/server/usage/write-budget.ts";

let cleanup: () => void;
let directory: string;
let db: ReturnType<typeof createDb>;

before(() => {
  directory = mkdtempSync(join(tmpdir(), "book-reader-budget-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  delete process.env.DAILY_WRITE_BUDGET;
  cleanup();
});

const MONDAY = new Date("2026-08-24T10:00:00.000Z");
const TUESDAY = new Date("2026-08-25T01:00:00.000Z");

test("the budget refuses further writes once the day is spent", async () => {
  process.env.DAILY_WRITE_BUDGET = "2";

  assert.equal(await chargeWrite(db, "reader-1", MONDAY), null);
  assert.equal(await chargeWrite(db, "reader-1", MONDAY), null);

  const refused = await chargeWrite(db, "reader-1", MONDAY);
  assert.ok(refused, "the third write should have been refused");
  assert.equal(refused.status, 429);
  const body = (await refused.json()) as { error: string };
  assert.match(body.error, /Daily save limit reached/);
  assert.match(body.error, /2 writes/);

  // Refusing must not stop counting, or the guard would let the next request
  // through as soon as it stopped incrementing.
  assert.equal((await chargeWrite(db, "reader-1", MONDAY))?.status, 429);
});

test("the budget is per person and resets with the UTC day", async () => {
  process.env.DAILY_WRITE_BUDGET = "2";

  // Someone else's day is untouched by the reader who spent theirs.
  assert.equal(await chargeWrite(db, "reader-2", MONDAY), null);
  // And tomorrow starts again.
  assert.equal(await chargeWrite(db, "reader-1", TUESDAY), null);
  assert.equal(await chargeWrite(db, "reader-1", TUESDAY), null);
  assert.equal((await chargeWrite(db, "reader-1", TUESDAY))?.status, 429);
});

test("an uncountable write is allowed through rather than blocked", async () => {
  process.env.DAILY_WRITE_BUDGET = "1";
  // A database without the counter table: a deployment that ran ahead of its
  // migration. Failing closed there would turn every save in the application
  // into an error.
  const unmigrated = createDb(join(directory, "unmigrated.db"));
  assert.equal(await chargeWrite(unmigrated, "reader-1", MONDAY), null);
});

test("the configured budget falls back to a sane default", () => {
  process.env.DAILY_WRITE_BUDGET = "500";
  assert.equal(dailyWriteBudget(), 500);
  for (const nonsense of ["0", "-1", "many", ""]) {
    process.env.DAILY_WRITE_BUDGET = nonsense;
    assert.equal(dailyWriteBudget(), DEFAULT_DAILY_WRITE_BUDGET);
  }
  delete process.env.DAILY_WRITE_BUDGET;
  assert.equal(dailyWriteBudget(), DEFAULT_DAILY_WRITE_BUDGET);
});
