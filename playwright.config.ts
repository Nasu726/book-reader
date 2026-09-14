import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Two at a time. Every reading test renders PDF pages in a real browser, and
  // several headless Chromium instances doing that at once starve the
  // development server.
  workers: 2,

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
      // The reader's actual phone: an iPhone 17, at its real viewport and its
      // real pixel ratio of 3 — which is what decides how large a rendered PDF
      // canvas is, and therefore how much memory a long document costs.
      //
      // Run in Chromium rather than WebKit because Playwright's WebKit needs
      // system libraries this machine does not have; installing them is task
      // H-10. So this guards the mobile *layout* and the sizes, not iOS
      // behaviour: selection handles, dvh against the collapsing toolbar, and
      // Safari's canvas budget still need the device itself (HUMAN-001).
      name: "mobile-layout",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["iPhone 17"],
        browserName: "chromium",
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    // Every test gets a fresh browser context and with it an empty IndexedDB,
    // so there is no database to isolate and nothing to tear down.
    command: "npm run dev -- --host 127.0.0.1 --port 3100 --strictPort",
    url: "http://127.0.0.1:3100",
    // Never reuse a server this config did not start: a stray dev server
    // could be serving another checkout.
    reuseExistingServer: false,
  },
});
