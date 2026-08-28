import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache is configured.
 *
 * Every route in this reader is authenticated and rendered per request — the
 * build output lists only /login and /_not-found as static — so there is
 * nothing for an ISR cache to hold. Wiring one up would mean a second R2
 * bucket binding that never receives a useful entry.
 */
export default defineCloudflareConfig({});
