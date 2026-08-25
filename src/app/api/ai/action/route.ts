import { cookies } from "next/headers";

import { createSqliteConversationRepository } from "@/repositories/sqlite/conversation-repository";
import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createAuthService } from "@/server/auth/service";
import { createAiProvider } from "@/server/ai/provider-factory";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createSqliteDb } from "@/server/db/client";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";

export async function POST(request: Request) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const authenticatedUser = session;

  let input: {
    prompt?: unknown;
    context?: unknown;
    documentId?: unknown;
    selectedText?: unknown;
    location?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const conversationRepository = createSqliteConversationRepository(
    createDrizzleFromSqlite(database),
  );
  const documentId = typeof input.documentId === "string" ? input.documentId : null;
  const document = documentId
    ? await createSqliteDocumentRepository(createDrizzleFromSqlite(database)).getById(documentId)
    : null;
  const ownedDocument = document?.userId === session.userId ? document : null;

  async function resolveConversation(): Promise<string | null> {
    if (!ownedDocument || !documentId) return null;
    const existing = await conversationRepository.getByDocument(documentId, authenticatedUser.userId);
    if (existing) return existing;
    const createdId = crypto.randomUUID();
    await conversationRepository.create(createdId, documentId, authenticatedUser.userId);
    return createdId;
  }
  const conversationId = await resolveConversation();

  let provider: ReturnType<typeof createAiProvider>;
  try {
    provider = createAiProvider();
  } catch {
    return Response.json({ error: "The AI provider is unavailable." }, { status: 503 });
  }

  try {
    const response = await provider.generate({
      context: typeof input.context === "string" ? input.context : undefined,
      prompt: input.prompt,
      signal: request.signal,
    });

    if (conversationId) {
      await conversationRepository.recordAssistantResponse({
        conversationId,
        content: response.content,
        location: typeof input.location === "string" ? input.location : undefined,
        selectedText: typeof input.selectedText === "string" ? input.selectedText : undefined,
      });
    }

    return Response.json(response);
  } catch {
    return Response.json(
      { error: "The AI request could not be completed. Please try again." },
      { status: 502 },
    );
  }
}
