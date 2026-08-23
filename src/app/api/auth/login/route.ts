import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { createSqliteDb } = await import("@/server/db/client");
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  let credentials: Record<string, FormDataEntryValue>;
  try {
    credentials = Object.fromEntries((await request.formData()).entries());
  } catch {
    return Response.json({ error: "Invalid credentials." }, { status: 400 });
  }

  try {
    const session = await authService.authenticate({
      ...credentials,
      clientKey: "single-client",
    });
    if (!session) {
      return new Response(null, {
        status: 303,
        headers: { location: "/login?error=invalid" },
      });
    }

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });
    return new Response(null, {
      status: 303,
      headers: { location: "/" },
    });
  } catch {
    return new Response(null, {
      status: 429,
      headers: { location: "/login?error=rate_limited" },
    });
  }
}
