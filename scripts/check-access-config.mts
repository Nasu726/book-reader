/**
 * Compares the audience tag this deployment verifies against with the one
 * Cloudflare Access is actually issuing.
 *
 * The tag is regenerated when the Access application is replaced, which can
 * happen without anyone intending it — reapplying a policy through the Worker's
 * Access tab did it once here. Nothing breaks visibly when it drifts: Access
 * still authenticates, the assertion still arrives, and the reader silently
 * rejects it because the audience does not match. The symptom is signing in and
 * landing back on the login page forever.
 *
 * Usage: npm run check:access [url]
 */

const url = process.argv[2] ?? "https://book-reader.nasu.uk";

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const response = await fetch(url, { redirect: "manual" });
const location = response.headers.get("location");

if (!location) {
  fail(
    `${url} did not redirect to Cloudflare Access (HTTP ${response.status}). `
    + "Either the deployment is not protected, or this URL is wrong.",
  );
}

const issued = new URL(location).searchParams.get("kid");
if (!issued) {
  fail(`The Access redirect carried no audience tag: ${location}`);
}

// The deployed value lives in wrangler.jsonc, which is JSONC — comments and all.
const config = await import("node:fs/promises")
  .then((fs) => fs.readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const configured = /"CF_ACCESS_AUD":\s*"([a-f0-9]*)"/.exec(config)?.[1];

if (!configured) {
  fail("wrangler.jsonc has no CF_ACCESS_AUD to compare against.");
}

if (configured !== issued) {
  console.error(`✖ The audience tag has drifted.\n`
    + `  Access issues:  ${issued}\n`
    + `  Deployment has: ${configured}\n\n`
    + "Sign-in will loop back to the login page until these match.\n"
    + "Fix: put the issued value in wrangler.jsonc and run `npx wrangler deploy`.");
  process.exit(1);
}

console.log(`✓ ${url} is behind Access and the audience tag matches.`);
console.log(`  ${issued}`);
