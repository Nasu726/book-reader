import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { beforeEach, test } from "node:test";

import {
  clearAccessKeyCache,
  readAccessConfig,
  verifyAccessToken,
} from "../../src/server/auth/cloudflare-access.ts";

const TEAM_DOMAIN = "https://example.cloudflareaccess.com";
const AUDIENCE = "a".repeat(64);
const CONFIG = { audience: AUDIENCE, teamDomain: TEAM_DOMAIN };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: "test-key" };

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signToken(
  payload: Record<string, unknown>,
  options: { key?: typeof privateKey; kid?: string; alg?: string } = {},
): string {
  const header = base64url(JSON.stringify({
    alg: options.alg ?? "RS256",
    kid: options.kid ?? "test-key",
  }));
  const body = base64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const signature = signer.sign(options.key ?? privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    aud: [AUDIENCE],
    email: "reader@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: TEAM_DOMAIN,
    sub: "provider-subject",
    ...overrides,
  };
}

let keyRequests = 0;
const keyFetch = (async () => {
  keyRequests += 1;
  return new Response(JSON.stringify({ keys: [jwk] }), {
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

beforeEach(() => {
  clearAccessKeyCache();
  keyRequests = 0;
});

test("configuration is only active when both settings are present", () => {
  assert.equal(readAccessConfig({}), null);
  assert.equal(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN }), null);
  assert.equal(readAccessConfig({ CF_ACCESS_AUD: AUDIENCE }), null);
  assert.deepEqual(
    readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: `${TEAM_DOMAIN}/`, CF_ACCESS_AUD: AUDIENCE }),
    CONFIG,
  );
});

test("a valid assertion identifies the reader by email", async () => {
  const identity = await verifyAccessToken(signToken(validPayload()), CONFIG, { fetch: keyFetch });
  assert.deepEqual(identity, { userId: "reader@example.com", email: "reader@example.com" });
});

test("a token signed by another key is refused", async () => {
  const forged = signToken(validPayload(), { key: otherPrivateKey });
  assert.equal(await verifyAccessToken(forged, CONFIG, { fetch: keyFetch }), null);
});

test("a token for another application is refused", async () => {
  const token = signToken(validPayload({ aud: ["b".repeat(64)] }));
  assert.equal(await verifyAccessToken(token, CONFIG, { fetch: keyFetch }), null);
});

test("a token from another team is refused", async () => {
  const token = signToken(validPayload({ iss: "https://attacker.cloudflareaccess.com" }));
  assert.equal(await verifyAccessToken(token, CONFIG, { fetch: keyFetch }), null);
});

test("an expired token is refused", async () => {
  const token = signToken(validPayload({ exp: Math.floor(Date.now() / 1000) - 1 }));
  assert.equal(await verifyAccessToken(token, CONFIG, { fetch: keyFetch }), null);
});

test("a token without a signature algorithm we accept is refused", async () => {
  // `alg: none` and symmetric algorithms are the classic JWT downgrade attacks.
  const header = base64url(JSON.stringify({ alg: "none", kid: "test-key" }));
  const body = base64url(JSON.stringify(validPayload()));
  assert.equal(await verifyAccessToken(`${header}.${body}.`, CONFIG, { fetch: keyFetch }), null);
  assert.equal(
    await verifyAccessToken(signToken(validPayload(), { alg: "HS256" }), CONFIG, { fetch: keyFetch }),
    null,
  );
});

test("a token naming an unknown signing key is refused", async () => {
  const token = signToken(validPayload(), { kid: "rotated-away" });
  assert.equal(await verifyAccessToken(token, CONFIG, { fetch: keyFetch }), null);
});

test("malformed input is refused rather than throwing", async () => {
  for (const candidate of [undefined, "", "not-a-token", "a.b", "a.b.c.d", "!!.??.@@"]) {
    assert.equal(await verifyAccessToken(candidate, CONFIG, { fetch: keyFetch }), null);
  }
});

test("the signing key set is fetched once and reused", async () => {
  const token = signToken(validPayload());
  await verifyAccessToken(token, CONFIG, { fetch: keyFetch });
  await verifyAccessToken(token, CONFIG, { fetch: keyFetch });
  assert.equal(keyRequests, 1);
});

test("an unreachable key set refuses the request instead of allowing it", async () => {
  const failing = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  assert.equal(await verifyAccessToken(signToken(validPayload()), CONFIG, { fetch: failing }), null);
});
