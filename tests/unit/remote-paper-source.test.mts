import assert from "node:assert/strict";
import { test } from "node:test";

import { proxyRemotePaperPdf } from "../../src/server/documents/remote-paper-source.ts";

test("canonical PDF proxy forwards Range and keeps only reader-safe headers", async () => {
  let requestedUrl = "";
  let requestedRange: string | null = null;
  const response = await proxyRemotePaperPdf(
    new Request("https://reader.example/api/documents/doc/source", {
      headers: { range: "bytes=100-199" },
    }),
    "https://papers.example/paper.pdf",
    async (input, init) => {
      requestedUrl = String(input);
      requestedRange = new Headers(init?.headers).get("range");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "accept-ranges": "bytes",
          "content-length": "3",
          "content-range": "bytes 100-102/1000",
          "content-type": "application/pdf",
          "set-cookie": "must-not-leak=1",
        },
      });
    },
  );

  assert.equal(requestedUrl, "https://papers.example/paper.pdf");
  assert.equal(requestedRange, "bytes=100-199");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 100-102/1000");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("an origin that ignores Range may fall back to a whole PDF response", async () => {
  const response = await proxyRemotePaperPdf(
    new Request("https://reader.example/source", { headers: { range: "bytes=0-9" } }),
    "https://papers.example/paper.pdf",
    async () => new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("accept-ranges"), null);
});

test("HTML landing pages are not fed to pdf.js as canonical PDFs", async () => {
  const response = await proxyRemotePaperPdf(
    new Request("https://reader.example/source"),
    "https://papers.example/landing",
    async () => new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Canonical paper source is not a PDF." });
});

test("canonical source URLs must be plain HTTP(S) URLs", async () => {
  let called = false;
  const response = await proxyRemotePaperPdf(
    new Request("https://reader.example/source"),
    "file:///etc/passwd",
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(response.status, 502);
  assert.equal(called, false);
});
