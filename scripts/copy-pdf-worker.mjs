import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Puts pdf.js's worker where the browser can fetch it.
 *
 * The worker used to be a copy committed by hand. Nothing kept it in step with
 * the installed package, and a worker built for one version talking to a main
 * thread from another fails with whatever internal call disagrees first —
 * "undefined is not a function", from the middle of minified code. Copying it
 * from node_modules at build time makes the two impossible to separate.
 *
 * The legacy build, matching the legacy build the reader imports. Mixing the
 * two is the same mismatch by another route.
 */
const require = createRequire(import.meta.url);
const source = join(
  dirname(require.resolve("pdfjs-dist/package.json")),
  "legacy/build/pdf.worker.min.mjs",
);
const destination = new URL("../public/pdf.worker.min.mjs", import.meta.url);

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await copyFile(source, destination);
console.log(`pdf.js worker copied from ${source}`);
