/**
 * The Worker: the app's files, and the vault's proxy.
 *
 * Everything that is a file is served by the assets binding, and any path that
 * is not one is the app itself (single-page fallback), which reads the screen
 * from the URL. `/api/vault/*` reaches the reader's notes in GitHub with the
 * token only this Worker holds.
 *
 * The proxy checks the Access assertion itself rather than trusting the edge
 * alone: a token that can write to someone's vault is worth a second lock, and
 * the check costs a millisecond.
 */

import { ACCESS_JWT_HEADER, readAccessConfig, verifyAccessToken } from "./access";
import { createMemoryStore, handleVault, storeFor, type VaultEnv } from "./vault";

export type Env = VaultEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};

// One memory store per Worker instance: what development and the tests use
// in place of GitHub, and what lets two "devices" in one test see each other.
const memory = createMemoryStore();

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const store = storeFor(env, () => memory);
  if (!store) return Response.json({ error: "The vault is not configured." }, { status: 503 });

  if (env.VAULT_STORE !== "memory") {
    const access = readAccessConfig({ CF_ACCESS_AUD: env.CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN });
    if (!access) return Response.json({ error: "Access is not configured." }, { status: 503 });
    const identity = await verifyAccessToken(request.headers.get(ACCESS_JWT_HEADER) ?? undefined, access);
    if (!identity) return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  return handleVault(request, env, store);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
