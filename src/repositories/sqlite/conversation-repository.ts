import { and, asc, eq } from "drizzle-orm";

import { conversations, messages } from "@/server/db/schema";
import {
  type ConversationRepository,
  type MessageRecord,
  type MessageRole,
  type PendingAssistantMessage,
} from "../types";
import type { Db } from "@/server/db/client";

type MessageRow = typeof messages.$inferSelect;

export function createSqliteConversationRepository(
  db: Db,
): ConversationRepository {
  async function create(
    conversationId: string,
    documentId: string,
    userId: string,
  ): Promise<void> {
    await db
      .insert(conversations)
      .values({ id: conversationId, documentId, userId });
  }

  async function listMessages(
    conversationId: string,
  ): Promise<readonly MessageRecord[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    return rows.map((row) => toRecord(row));
  }

  async function getByDocument(
    documentId: string,
    userId: string,
  ): Promise<string | null> {
    const rows = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.documentId, documentId), eq(conversations.userId, userId)))
      .orderBy(asc(conversations.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /**
   * Removes the document's conversation and everything said in it.
   *
   * The messages are deleted explicitly rather than left to the foreign key:
   * cascade behaviour depends on the driver having foreign keys switched on,
   * and a half-deleted conversation is worse than none.
   */
  async function deleteByDocument(documentId: string, userId: string): Promise<void> {
    const conversationId = await getByDocument(documentId, userId);
    if (!conversationId) return;
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(
      and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
    );
  }

  async function addMessage(message: MessageRecord): Promise<void> {
    await db.insert(messages).values(toValues(message));
  }

  async function beginPendingAssistantMessage(
    message: PendingAssistantMessage,
  ): Promise<void> {
    await db.insert(messages).values({
      id: message.id,
      conversationId: message.conversationId,
      role: "assistant",
      content: "",
      createdAt: message.createdAt,
    });
  }

  async function completePendingAssistantMessage(
    messageId: string,
    content: string,
    context?: { selectedText?: string; location?: string },
  ): Promise<void> {
    await db
      .update(messages)
      .set({
        content,
        selectedText: context?.selectedText,
        location: context?.location,
      })
      .where(eq(messages.id, messageId));
  }

  async function recordAssistantResponse(input: {
    conversationId: string;
    content: string;
    selectedText?: string;
    location?: string;
  }): Promise<void> {
    const messageId = crypto.randomUUID();
    await beginPendingAssistantMessage({
      id: messageId,
      conversationId: input.conversationId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
    });
    await completePendingAssistantMessage(messageId, input.content, {
      location: input.location,
      selectedText: input.selectedText,
    });
  }

  return {
    create,
    deleteByDocument,
    getByDocument,
    listMessages,
    addMessage,
    beginPendingAssistantMessage,
    completePendingAssistantMessage,
    recordAssistantResponse,
  };
}

function toRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    selectedText: row.selectedText ?? undefined,
    location: row.location ?? undefined,
    createdAt: row.createdAt,
  };
}

function toValues(message: MessageRecord) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    selectedText: message.selectedText,
    location: message.location,
    createdAt: message.createdAt,
  };
}
