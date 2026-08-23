import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      AUTH_PASSWORD_HASH:
        "scrypt:51068f67653bb61dcde36611ae6cd2c1:68ab223fad3c2dbe58e00cd4cbdd729d24894dd4b22b82f876631e0d9826743157a34cb2bded38d462456467174a5e8f1cd31a81152b7bb26202f57437688a08",
      AUTH_USERNAME: "e2e-reader",
      DATABASE_PATH: "/tmp/book-reader-e2e.db",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
});
