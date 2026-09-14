import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryStore, createGithubStore, handleVault, noteNameIsSafe } from "../../worker/vault.ts";

const env = (overrides: Record<string, string> = {}) => ({
  VAULT_DIR: "Reading",
  VAULT_REPO: "someone/vault",
  VAULT_STORE: "memory",
  ...overrides,
});

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://reader.example${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method,
  });
}

test("only note names are accepted: one file, .md, nothing that walks the tree", () => {
  assert.equal(noteNameIsSafe("Attention (8f2a1c3d).md"), true);
  assert.equal(noteNameIsSafe("論文の題名 (8f2a1c3d).md"), true);
  assert.equal(noteNameIsSafe("../secrets.md"), false);
  assert.equal(noteNameIsSafe("sub/dir.md"), false);
  assert.equal(noteNameIsSafe("note.txt"), false);
  assert.equal(noteNameIsSafe(".md"), false);
  assert.equal(noteNameIsSafe(`${"a".repeat(250)}.md`), false);
  assert.equal(noteNameIsSafe("has\nnewline.md"), false);
});

test("the memory store round-trips a note with a sha that changes with the text", async () => {
  const store = createMemoryStore();
  assert.equal(await store.get("Reading/a.md"), null);
  const first = await store.put("Reading/a.md", "one", undefined, "m");
  assert.ok(first !== "conflict");
  const read = await store.get("Reading/a.md");
  assert.equal(read?.text, "one");
  assert.equal(read?.sha, first.sha);
  // Writing over a note needs its current sha; a stale one is a conflict.
  assert.equal(await store.put("Reading/a.md", "two", "stale", "m"), "conflict");
  assert.equal(await store.put("Reading/a.md", "two", undefined, "m"), "conflict");
  const second = await store.put("Reading/a.md", "two", first.sha, "m");
  assert.ok(second !== "conflict" && second.sha !== first.sha);
  assert.deepEqual((await store.list("Reading")).map((entry) => entry.name), ["a.md"]);
});

test("the routes: list, get, put, and nothing else", async () => {
  const store = createMemoryStore();
  const call = (method: string, path: string, body?: unknown) => handleVault(request(method, path, body), env(), store);

  assert.equal((await call("GET", "/api/vault/notes")).status, 200);
  assert.deepEqual(await (await call("GET", "/api/vault/notes")).json(), { notes: [] });
  assert.equal((await call("GET", "/api/vault/notes/missing.md")).status, 404);

  const created = await call("PUT", "/api/vault/notes/Paper%20(8f2a1c3d).md", { message: "reader: Paper", text: "# hi" });
  assert.equal(created.status, 201);
  const { sha } = (await created.json()) as { sha: string };
  assert.ok(sha);

  const fetched = await call("GET", "/api/vault/notes/Paper%20(8f2a1c3d).md");
  assert.equal(fetched.status, 200);
  assert.deepEqual(await fetched.json(), { sha, text: "# hi" });
  assert.deepEqual(await (await call("GET", "/api/vault/notes")).json(), { notes: [{ name: "Paper (8f2a1c3d).md", sha }] });

  assert.equal((await call("PUT", "/api/vault/notes/Paper%20(8f2a1c3d).md", { message: "m", sha: "stale", text: "x" })).status, 409);
  assert.equal((await call("PUT", "/api/vault/notes/Paper%20(8f2a1c3d).md", { message: "m", sha, text: "# changed" })).status, 200);

  assert.equal((await call("DELETE", "/api/vault/notes/Paper%20(8f2a1c3d).md")).status, 405);
  assert.equal((await call("POST", "/api/vault/notes/Paper%20(8f2a1c3d).md", { text: "x" })).status, 405);
  assert.equal((await call("GET", "/api/vault/notes/..%2Fsecret.md")).status, 400);
  assert.equal((await call("PUT", "/api/vault/notes/big.md", { message: "m", text: "x".repeat(1_100_000) })).status, 413);
  assert.equal((await call("PUT", "/api/vault/notes/bad.md", { text: 42 })).status, 400);
  assert.equal((await call("GET", "/api/vault/elsewhere")).status, 404);
});

test("the GitHub store speaks the contents API and never lets the token out", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const files = new Map<string, { content: string; sha: string }>();
  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({ init, url });
    const path = decodeURIComponent(url.replace("https://api.github.com/repos/someone/vault/contents/", "").split("?")[0]);
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { content: string; sha?: string };
      const current = files.get(path);
      if (current && body.sha !== current.sha) return new Response("{}", { status: 409 });
      if (!current && body.sha) return new Response("{}", { status: 422 });
      const sha = `sha-${files.size + 1}-${body.content.length}`;
      files.set(path, { content: body.content, sha });
      return Response.json({ content: { sha } }, { status: current ? 200 : 201 });
    }
    if (path === "Reading") {
      return Response.json([...files.entries()].map(([name, file]) => ({ name: name.replace("Reading/", ""), sha: file.sha, type: "file" })));
    }
    const file = files.get(path);
    return file ? Response.json({ content: file.content, encoding: "base64", sha: file.sha }) : new Response("{}", { status: 404 });
  };

  const store = createGithubStore({ fetch: fakeFetch as typeof fetch, repo: "someone/vault", token: "ghp_secret" });
  const put = await store.put("Reading/日本語 (8f2a1c3d).md", "本文 with ünïcode", undefined, "reader: test");
  assert.ok(put !== "conflict");
  const got = await store.get("Reading/日本語 (8f2a1c3d).md");
  assert.equal(got?.text, "本文 with ünïcode");
  assert.equal(got?.sha, put.sha);
  assert.equal(await store.put("Reading/日本語 (8f2a1c3d).md", "again", "stale", "m"), "conflict");
  assert.deepEqual((await store.list("Reading")).map((entry) => entry.name), ["日本語 (8f2a1c3d).md"]);

  for (const { init, url } of seen) {
    assert.match(String((init.headers as Record<string, string>).authorization), /^Bearer ghp_secret$/);
    assert.doesNotMatch(url, /ghp_secret/);
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/someone\/vault\/contents\/Reading/);
  }

  // A GitHub failure reaches the client as a status, never as GitHub's body.
  const failing = createGithubStore({
    fetch: (async () => new Response("token ghp_secret is bad", { status: 401 })) as typeof fetch,
    repo: "someone/vault",
    token: "ghp_secret",
  });
  const response = await handleVault(request("GET", "/api/vault/notes/x.md"), env({ VAULT_STORE: "github" }), failing);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /ghp_secret/);
});
