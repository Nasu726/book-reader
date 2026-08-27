import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Vendored or generated, and not ours to lint: the pdf.js worker is a
    // published build, and .open-next is what the Cloudflare adapter emits.
    ignores: ["public/pdf.worker.min.mjs", ".open-next/**", ".wrangler/**"],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
