import { cookies } from "next/headers";

import { OpenRouterProvider } from "@/server/ai/openrouter-provider";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createSqliteDb } from "@/server/db/client";

export async function POST(request: Request) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let input: { prompt?: unknown; context?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) {
    return Response.json({ error: "The AI provider is unavailable." }, { status: 503 });
  }

  try {
    const provider = new OpenRouterProvider({ apiKey, model });
    return Response.json(await provider.generate({
      context: typeof input.context === "string" ? input.context : undefined,
      prompt: input.prompt,
      signal: request.signal,
    }));
  } catch {
    return Response.json(
      { error: "The AI request could not be completed. Please try again." },
      { status: 502 },
    );
  }
}
