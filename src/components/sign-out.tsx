"use client";

/**
 * Ends the session and returns to the sign-in screen.
 *
 * Where Cloudflare Access authenticates, clearing this application's own cookie
 * would achieve nothing: Access still holds a valid session and would wave the
 * next request straight back through. Its logout endpoint is what actually
 * signs someone out, and it lands on the Access sign-in page afterwards.
 */
export function SignOut({ usesAccess }: { usesAccess: boolean }) {
  if (usesAccess) {
    return (
      <a
        className="text-ink-quiet hover:text-ink flex min-h-11 shrink-0 items-center text-xs tracking-wide uppercase transition-colors duration-(--fast)"
        href="/cdn-cgi/access/logout"
      >
        Sign out
      </a>
    );
  }

  return (
    <form action="/api/auth/logout" method="post">
      <button
        className="text-ink-quiet hover:text-ink min-h-11 text-xs tracking-wide uppercase transition-colors duration-(--fast)"
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
}
