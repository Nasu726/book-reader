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
        className="flex min-h-11 items-center rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
        href="/cdn-cgi/access/logout"
      >
        Sign out
      </a>
    );
  }

  return (
    <form action="/api/auth/logout" method="post">
      <button
        className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
}
