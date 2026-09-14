import { useSyncExternalStore } from "react";

/**
 * Where the reader is, from the URL's path.
 *
 * Three screens do not need a router library. The host serves `index.html`
 * for any path (Vite in development, the Worker's single-page fallback in
 * production), so `/read/abc` is a real URL that survives a reload, and the
 * manual's in-page anchors keep their `#` to themselves.
 */
export type Route =
  | { screen: "library" }
  | { screen: "read"; id: string }
  | { screen: "help" };

export function parseRoute(pathname: string): Route {
  const read = /^\/read\/([A-Za-z0-9._-]+)\/?$/.exec(pathname);
  if (read) return { screen: "read", id: read[1] };
  if (/^\/help\/?$/.test(pathname)) return { screen: "help" };
  return { screen: "library" };
}

export function routeTo(route: Route): string {
  switch (route.screen) {
    case "read": return `/read/${route.id}`;
    case "help": return "/help";
    default: return "/";
  }
}

const NAVIGATE = "book-reader:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE, onChange);
  };
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
  return parseRoute(pathname);
}

export function navigate(route: Route): void {
  window.history.pushState(null, "", routeTo(route));
  window.dispatchEvent(new Event(NAVIGATE));
}

/**
 * Makes ordinary links move between screens without reloading the app.
 *
 * Plain `<a href>` everywhere, one listener here: a same-origin link with no
 * modifier keys is a navigation; anything else — a new tab, a download, an
 * anchor within the page — is left to the browser.
 */
export function interceptLinks(): () => void {
  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.hash) return;
    event.preventDefault();
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new Event(NAVIGATE));
  }
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
