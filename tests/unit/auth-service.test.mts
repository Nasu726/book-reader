import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createSqliteDb } from "../../src/server/db/client.ts";
import { hashPassword } from "../../src/server/auth/password.ts";
import { createAuthService } from "../../src/server/auth/service.ts";
import { migrateSessions } from "../../src/server/auth/session-store.ts";

let cleanup: () => void;
let service: ReturnType<typeof createAuthService>;

before(async () => {
  process.env.AUTH_USERNAME = "reader";
  process.env.AUTH_PASSWORD_HASH = await hashPassword("correct-password");
  const databasePath = join(mkdtempSync(join(tmpdir(), "book-reader-auth-")), "test.db");
  const database = createSqliteDb(databasePath);
  migrateSessions(database);
  service = createAuthService(database);
  cleanup = () => rmSync(databasePath.replace("/test.db", ""), { recursive: true, force: true });
});

after(() => {
  delete process.env.AUTH_USERNAME;
  delete process.env.AUTH_PASSWORD_HASH;
  cleanup();
});

test("correct credentials issue a unique session", async () => {
  const first = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "client",
  });
  const second = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "client",
  });

  assert.ok(first && second);
  assert.notEqual(first.token, second.token);
  assert.deepEqual(service.getSessionUser(second.token), {
    userId: "reader",
  });
});

test("invalid username or password returns the same null result", async () => {
  for (const input of [
    { username: "wrong", password: "correct-password" },
    { username: "reader", password: "wrong" },
  ]) {
    assert.equal(await service.authenticate({ ...input, clientKey: `invalid-${input.username}` }), null);
  }
});

test("rate limiting rejects excessive authentication attempts", async () => {
  const clientKey = "rate-limited-client";
  for (let index = 0; index < 10; index += 1) {
    await service.authenticate({
      username: "wrong",
      password: "correct-password",
      clientKey,
    });
  }

  await assert.rejects(
    service.authenticate({
      username: "reader",
      password: "correct-password",
      clientKey,
    }),
    /rate_limited/,
  );
});

test("logout invalidates all sessions for the single user", async () => {
  const session = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "logout-client",
  });
  assert.ok(session);
  service.logout(session.userId);

  assert.equal(service.getSessionUser(session.token), null);
});
