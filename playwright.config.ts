import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 1,
  testDir: "./tests/e2e",
  projects: process.env.E2E_PROJECTS?.split(",").map((project) => ({
    name: project.trim(),
    use: project.trim() === "webkit" ? { ...devices["Desktop Safari"] } : { ...devices["Desktop Chrome"] },
  })) ?? [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      AUTH_PASSWORD_HASH:
        "scrypt:56049e4b19b83a241687775cbc0e3056:70cf96fa32a1cfd97310216fdc7b88d9097274bff772f0e81380d07572392a4a30e3b2567f39713cc0ff84e9d5b16415ee4ec097d7f1a96e47c7de57981d0205",
      AUTH_USERNAME: "e2e-reader",
      DATABASE_PATH: "/tmp/book-reader-e2e.db",
      AI_PROVIDER: "mock",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
});
