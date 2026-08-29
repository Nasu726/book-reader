import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("pdfjs-dist/package.json"));

/**
 * The worker in public/ has to be the one the installed package shipped.
 *
 * A worker built for one version of pdf.js, talking to a main thread from
 * another, fails at whatever internal call disagrees first — reported as
 * "undefined is not a function" from the middle of minified code, with nothing
 * to say which two versions are arguing.
 */
test("the served pdf.js worker is the one the package shipped", () => {
  const served = join(import.meta.dirname, "../../public/pdf.worker.min.mjs");
  const shipped = join(packageRoot, "legacy/build/pdf.worker.min.mjs");

  assert.equal(
    statSync(served).size,
    statSync(shipped).size,
    "public/pdf.worker.min.mjs differs from the installed pdfjs-dist; run `npm run pdf-worker`",
  );
  assert.equal(readFileSync(served, "utf8"), readFileSync(shipped, "utf8"));
});

test("the reader and the worker come from the same build", () => {
  // Legacy on both sides. The modern build assumes browser features the legacy
  // one polyfills, and pairing them across that line is the same mismatch by
  // another route.
  const sources = ["src/components/pdf-renderer.tsx", "src/core/pdf/renderer.ts"];
  for (const source of sources) {
    const text = readFileSync(join(import.meta.dirname, "../..", source), "utf8");
    if (!text.includes("pdfjs-dist")) continue;
    assert.match(
      text,
      /pdfjs-dist\/legacy\/build\/pdf\.mjs/,
      `${source} must import the legacy build, to match the worker in public/`,
    );
  }
});
