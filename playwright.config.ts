import { defineConfig, devices } from "@playwright/test";

import {
  E2E_DATABASE_PATH,
  E2E_PASSWORD_HASH,
  E2E_STORAGE_DIR,
  E2E_USERNAME,
} from "./tests/e2e/environment";

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
  },
  projects: [
    {
      name: "desktop",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Chromium with a phone viewport, touch input, and mobile device pixel
      // ratio. This guards the mobile *layout* only: iOS forces every browser
      // onto WKWebView, so iOS Safari and iOS Chrome behaviour — selection
      // handles, dvh against the collapsing toolbar, keyboard insets — is not
      // reproduced here and still needs a real device (HUMAN-001).
      name: "mobile-layout",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      AI_MODEL: "mock-model",
      // The suite must exercise the real server AI route, not a browser stub,
      // so the provider is swapped instead of the transport.
      AI_PROVIDER: "mock",
      AUTH_PASSWORD_HASH: E2E_PASSWORD_HASH,
      AUTH_USERNAME: E2E_USERNAME,
      DATABASE_PATH: E2E_DATABASE_PATH,
      DOCUMENT_STORAGE_DIR: E2E_STORAGE_DIR,
    },
    url: "http://127.0.0.1:3100",
    // Never reuse a server this config did not configure: a stray `next dev`
    // would run the suite against the developer's own database and env.
    reuseExistingServer: false,
  },
});
