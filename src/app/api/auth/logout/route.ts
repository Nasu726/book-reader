import { createAuthService } from "@/server/auth/service";
import { getLocalAuthDatabase } from "@/server/auth/current-session";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";

export async function POST() {
  const database = await getLocalAuthDatabase();
  if (!database) {
    // Sign-in is handled ahead of the application by Cloudflare Access.
    return Response.json({ error: "Not available." }, { status: 404 });
  }
  const authService = createAuthService(database);
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  authService.logout(token);

  (await cookies()).delete(SESSION_COOKIE_NAME);
  return new Response(null, {
    status: 303,
    headers: { location: "/login" },
  });
}
