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

test("logout ends only the device that signed out", async () => {
  const phone = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "logout-client",
  });
  const laptop = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "logout-client",
  });
  assert.ok(phone);
  assert.ok(laptop);
  assert.notEqual(phone.token, laptop.token);

  service.logout(phone.token);

  assert.equal(service.getSessionUser(phone.token), null);
  assert.deepEqual(service.getSessionUser(laptop.token), { userId: "reader" });
});

test("signing in on a second device keeps the first one signed in", async () => {
  const first = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "multi-device-client",
  });
  assert.ok(first);
  const second = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "multi-device-client",
  });
  assert.ok(second);

  assert.deepEqual(service.getSessionUser(first.token), { userId: "reader" });
  assert.deepEqual(service.getSessionUser(second.token), { userId: "reader" });
});

test("logoutEverywhere revokes every device for the user", async () => {
  const phone = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "revoke-all-client",
  });
  const laptop = await service.authenticate({
    username: "reader",
    password: "correct-password",
    clientKey: "revoke-all-client",
  });
  assert.ok(phone);
  assert.ok(laptop);

  service.logoutEverywhere("reader");

  assert.equal(service.getSessionUser(phone.token), null);
  assert.equal(service.getSessionUser(laptop.token), null);
});
