/**
 * Authentication delegated to Cloudflare Access.
 *
 * Access authenticates the person before the request reaches this application
 * and forwards a signed assertion. Verifying an RS256 signature costs under a
 * millisecond, where the password path costs 51–79 ms of CPU on this machine —
 * far past the 10 ms a Cloudflare Worker gets on the free plan.
 *
 * Only the signature, issuer, audience, and expiry are trusted here. The header
 * alone is not: anything reaching the origin outside Access could set it.
 */

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export type CloudflareAccessConfig = {
  /** e.g. https://example.cloudflareaccess.com */
  teamDomain: string;
  /** The application's Audience tag from the Access dashboard. */
  audience: string;
};

export function readAccessConfig(
  env: Record<string, string | undefined> = process.env,
): CloudflareAccessConfig | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) return null;
  return {
    audience,
    teamDomain: teamDomain.replace(/\/+$/, ""),
  };
}

type JsonWebKey_ = JsonWebKey & { kid?: string; alg?: string };

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeSegment(segment)));
}

/**
 * Access rotates signing keys every six weeks and keeps the previous one valid
 * for seven days, so the key set is refetched rather than pinned. The result is
 * cached because a fetch per request would be wasteful, not because it is
 * expensive: waiting on it costs no CPU time.
 */
const keyCache = new Map<string, { keys: JsonWebKey_[]; expiresAt: number }>();
const KEY_CACHE_MS = 60 * 60 * 1000;

async function fetchSigningKeys(
  teamDomain: string,
  fetchImplementation: typeof fetch,
): Promise<JsonWebKey_[]> {
  const cached = keyCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetchImplementation(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("The Access key set could not be read.");
  const payload = (await response.json()) as { keys?: JsonWebKey_[] };
  const keys = payload.keys ?? [];
  keyCache.set(teamDomain, { keys, expiresAt: Date.now() + KEY_CACHE_MS });
  return keys;
}

/** Exposed for tests; a fresh key set is fetched on the next verification. */
export function clearAccessKeyCache(): void {
  keyCache.clear();
}

export type AccessIdentity = {
  userId: string;
  email: string;
};

/**
 * Returns the identity carried by a valid Access assertion, or null.
 *
 * Never throws for an untrusted token: a caller cannot tell a forged token from
 * an expired one, and both mean the same thing here.
 */
export async function verifyAccessToken(
  token: string | undefined,
  config: CloudflareAccessConfig,
  options: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<AccessIdentity | null> {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  try {
    const header = decodeJson(segments[0]) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) return null;

    const keys = await fetchSigningKeys(config.teamDomain, options.fetch ?? fetch);
    const jwk = keys.find((candidate) => candidate.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeSegment(segments[2]),
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
    if (!verified) return null;

    const payload = decodeJson(segments[1]) as {
      aud?: unknown;
      email?: unknown;
      exp?: unknown;
      iss?: unknown;
      sub?: unknown;
    };

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.audience)) return null;
    if (payload.iss !== config.teamDomain) return null;

    const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;

    const email = typeof payload.email === "string" ? payload.email : "";
    const subject = typeof payload.sub === "string" ? payload.sub : "";
    if (!email && !subject) return null;

    // The email is the stable identity across devices; documents are owned by
    // it. `sub` is per identity-provider and would split a person's library if
    // they ever signed in through a second provider.
    return { userId: email || subject, email };
  } catch {
    return null;
  }
}
