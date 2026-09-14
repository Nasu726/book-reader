import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Runs the Worker's API inside the development server.
 *
 * The Worker is plain fetch-handler code, and Node has Request and Response,
 * so the same module that serves `/api/vault/*` in production serves it here —
 * against the memory store, unless VAULT_STORE says otherwise. No second
 * process, no emulator; the E2E suite exercises the real routing code.
 */
function workerApi(): Plugin {
  return {
    name: "book-reader-worker-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleApi } = await server.ssrLoadModule("/worker/index.ts") as typeof import("./worker/index");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(`http://${req.headers.host ?? "localhost"}/api${req.url ?? ""}`, {
          body: body && req.method !== "GET" && req.method !== "HEAD" ? new Uint8Array(body) : undefined,
          headers: Object.entries(req.headers).flatMap(([key, value]) =>
            typeof value === "string" ? [[key, value] as [string, string]] : (value ?? []).map((v) => [key, v] as [string, string])),
          method: req.method,
        });
        const env = {
          ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
          VAULT_DIR: process.env.VAULT_DIR ?? "Reading",
          VAULT_REPO: process.env.VAULT_REPO,
          VAULT_STORE: process.env.VAULT_STORE ?? "memory",
          VAULT_TOKEN: process.env.VAULT_TOKEN,
        };
        const response = await handleApi(request, env);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    workerApi(),
    // The app shell, the pdf.js worker and the icons are cached on install,
    // so the reader opens on a train. The manifest is the hand-written one in
    // public/. Nothing under /api is ever answered from the cache.
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      includeAssets: ["icon-192.png", "icon-512.png", "pdf.worker.min.mjs"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,mjs,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Deterministic ports: the E2E suite starts its own server here and refuses
  // to reuse one it did not configure.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
