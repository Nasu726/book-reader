
import { createSqliteConversationRepository } from "@/repositories/sqlite/conversation-repository";
import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { AiProviderError, generateWithRetry } from "@/core/ai/provider";
import { createAiProvider } from "@/server/ai/provider-factory";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase } from "@/server/db/database";

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARACTERS = 8_000;
const MAX_PROMPT_CHARACTERS = 20_000;
const MAX_CONTEXT_CHARACTERS = 40_000;

export async function POST(request: Request) {
  const database = await getDatabase();
  const session = await getCurrentUser();
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
  if (
    typeof input.prompt !== "string" || !input.prompt.trim() ||
    input.prompt.length > MAX_PROMPT_CHARACTERS ||
    (typeof input.context === "string" && input.context.length > MAX_CONTEXT_CHARACTERS) ||
    (typeof input.selectedText === "string" && input.selectedText.length > 100_000) ||
    (typeof input.location === "string" && input.location.length > 10_000)
  ) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const conversationRepository = createSqliteConversationRepository(
    database,
  );
  const documentId = typeof input.documentId === "string" ? input.documentId : null;
  const document = documentId
    ? await createSqliteDocumentRepository(database).getById(documentId)
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
  const previousMessages = conversationId
    ? await conversationRepository.listMessages(conversationId)
    : [];
  const historyContext = formatConversationHistory(previousMessages);

  if (conversationId) {
    await conversationRepository.addMessage({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: input.prompt,
      selectedText: typeof input.selectedText === "string" ? input.selectedText : undefined,
      location: typeof input.location === "string" ? input.location : undefined,
      createdAt: new Date(),
    });
  }

  let provider: ReturnType<typeof createAiProvider>;
  try {
    provider = createAiProvider();
  } catch {
    return Response.json({ error: "The AI provider is unavailable." }, { status: 503 });
  }

  try {
    const response = await generateWithRetry(provider, {
      context: [
        typeof input.context === "string" ? input.context.trim() : "",
        historyContext,
      ].filter(Boolean).join("\n\n") || undefined,
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
  } catch (error) {
    // The reader only ever sees a generic message; the upstream detail stays in
    // the server log, where a wrong model id or an exhausted quota is visible.
    if (error instanceof AiProviderError) {
      console.error("AI provider failed", {
        reason: error.reason,
        retryable: error.retryable,
        status: error.status,
        upstream: typeof error.cause === "string" ? error.cause.slice(0, 500) : undefined,
      });
    } else {
      console.error("AI request failed", error);
    }
    return Response.json(
      { error: "The AI request could not be completed. Please try again." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) {
    return Response.json({ error: "Document ID is required." }, { status: 400 });
  }

  const document = await createSqliteDocumentRepository(
    database,
  ).getById(documentId);
  if (document?.userId !== session.userId) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const conversationRepository = createSqliteConversationRepository(
    database,
  );
  const conversationId = await conversationRepository.getByDocument(documentId, session.userId);
  const messages = conversationId
    ? (await conversationRepository.listMessages(conversationId)).filter((message) => message.content)
    : [];
  return Response.json({ messages });
}

function formatConversationHistory(messages: readonly {
  role: "user" | "assistant";
  content: string;
}[]): string | undefined {
  const recentMessages = messages
    .filter((message) => message.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.length > MAX_HISTORY_CHARACTERS / MAX_HISTORY_MESSAGES
        ? `${message.content.slice(0, MAX_HISTORY_CHARACTERS / MAX_HISTORY_MESSAGES - 1)}…`
        : message.content,
    }));
  if (recentMessages.length === 0) return undefined;

  let history = recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  while (history.length > MAX_HISTORY_CHARACTERS && recentMessages.length > 1) {
    recentMessages.shift();
    history = recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  }
  return history.length <= MAX_HISTORY_CHARACTERS
    ? `Previous conversation:\n\n${history}`
    : undefined;
}
