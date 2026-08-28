import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: false,
    webpackBuildWorker: false,
  },
};

export default nextConfig;

// Off by default. Enabling this hands `next dev` the local D1 and R2 bindings,
// which makes the reader use them instead of the SQLite file and document
// directory that local development and the E2E suite are set up around — the
// first symptom is every page failing with "no such table: documents".
//
// The Cloudflare path is verified through `npm run cf:preview`, which runs the
// real Worker against the real bindings, rather than by bending `next dev`.
if (process.env.USE_CLOUDFLARE_BINDINGS === "1") {
  void initOpenNextCloudflareForDev();
}
