import { asc, eq } from "drizzle-orm";

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

  return {
    create,
    listMessages,
    addMessage,
    beginPendingAssistantMessage,
    completePendingAssistantMessage,
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
