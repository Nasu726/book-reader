/**
 * Runs once when a server instance starts, before it serves anything.
 *
 * Deliberately does not wire up the database or the document store. Next.js
 * makes no guarantee that this module and a route handler share module state,
 * so both are resolved on first use instead; see server/db/database.ts. This
 * hook exists to fail loudly at boot when the deployment is misconfigured,
 * rather than on a reader's first request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { readAccessConfig } = await import("@/server/auth/cloudflare-access");
  if (readAccessConfig()) return;

  if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD_HASH) {
    console.warn(
      "No sign-in is configured: set AUTH_USERNAME and AUTH_PASSWORD_HASH for the built-in login, "
      + "or CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD to let Cloudflare Access authenticate.",
    );
  }
}
