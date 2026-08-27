export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <form action="/api/auth/login" className="mt-8 space-y-4" method="post">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="username">Username</label>
          <input
            autoComplete="username"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        <button className="min-h-11 w-full rounded-lg bg-zinc-900 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
