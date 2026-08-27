/**
 * True when this code is executing inside the Cloudflare Workers runtime.
 *
 * The Workers runtime identifies itself through navigator.userAgent. Asking
 * @opennextjs/cloudflare for a request context is not a reliable substitute:
 * it resolves during `next dev` too, which silently pointed the local reader
 * at an empty local D1 instead of its SQLite file.
 */
export function isCloudflareWorker(): boolean {
  return globalThis.navigator?.userAgent === "Cloudflare-Workers";
}
