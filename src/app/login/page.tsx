export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <form action="/api/auth/login" className="mt-8 space-y-4" method="post">
        <input
          autoComplete="username"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          name="username"
          aria-label="Username"
          required
          type="text"
        />
        <input
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          name="password"
          aria-label="Password"
          required
          type="password"
        />
        <button className="w-full rounded-lg bg-zinc-900 py-2 text-white" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
