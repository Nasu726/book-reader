import { readAccessConfig } from "@/server/auth/cloudflare-access";
import { isCloudflareWorker } from "@/server/runtime";

export default function LoginPage() {
  // The built-in login needs a SQLite file, which a Cloudflare Worker has no
  // way to open. There, Cloudflare Access signs people in before the request
  // reaches this page — so if it is reachable at all, Access is not set up yet.
  if (isCloudflareWorker() && !readAccessConfig()) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in is not configured</h1>
        <p className="text-ink-quiet">
          This deployment expects Cloudflare Access to authenticate readers before
          they reach it. Create an Access application for this hostname, then set
          <code className="mx-1 rounded bg-rule/40 px-1">CF_ACCESS_TEAM_DOMAIN</code>
          and
          <code className="mx-1 rounded bg-rule/40 px-1">CF_ACCESS_AUD</code>.
        </p>
        <p className="text-sm text-ink-quiet">See docs/HUMAN-TASKS.md, task H-4.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <form action="/api/auth/login" className="mt-8 space-y-4" method="post">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="username">Username</label>
          <input
            autoComplete="username"
            className="border-edge bg-field w-full rounded-lg border px-3 py-2"
            id="username"
            name="username"
            required
            type="text"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            className="border-edge bg-field w-full rounded-lg border px-3 py-2"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        <button className="min-h-11 w-full rounded-lg bg-ink py-2 text-white" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
