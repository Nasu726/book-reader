import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Vendored or generated, not ours to lint: the pdf.js worker is a
    // published build; dist and .wrangler are what the build tools emit.
    ignores: ["public/pdf.worker.min.mjs", "dist/**", ".wrangler/**", ".next/**", ".open-next/**", "test-results/**", "playwright-report/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
);
