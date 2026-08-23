export type DocumentRecord = {
  id: string;
  userId: string;
  title: string;
  format: "epub" | "pdf";
  author?: string;
  sourceFilename?: string;
};

export type LibraryItem = DocumentRecord & {
  lastOpenedAt?: Date;
  progress: number;
};

export type DocumentSectionRecord = {
  documentId: string;
  sectionId: string;
  title?: string;
  content: string;
  sortOrder: number;
};

export interface DocumentRepository {
  list(): Promise<readonly DocumentRecord[]>;
  getById(id: string): Promise<DocumentRecord | null>;
  create(document: DocumentRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export interface DocumentSectionRepository {
  listByDocument(documentId: string): Promise<readonly DocumentSectionRecord[]>;
  upsertMany(sections: readonly DocumentSectionRecord[]): Promise<void>;
}

export interface ReadingProgressRepository {
  getByDocument(documentId: string): Promise<{ documentId: string; location: string } | null>;
  save(input: { documentId: string; userId: string; location: string }): Promise<void>;
}

export type MessageRole = "user" | "assistant";

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  selectedText?: string;
  location?: string;
  createdAt: Date;
};

export type PendingAssistantMessage = {
  id: string;
  conversationId: string;
  role: "assistant";
  content: "";
  createdAt: Date;
};

export interface ConversationRepository {
  create(
    conversationId: string,
    documentId: string,
    userId: string,
  ): Promise<void>;
  listMessages(conversationId: string): Promise<readonly MessageRecord[]>;
  addMessage(message: MessageRecord): Promise<void>;
  beginPendingAssistantMessage(
    message: PendingAssistantMessage,
  ): Promise<void>;
  completePendingAssistantMessage(
    messageId: string,
    content: string,
    context?: { selectedText?: string; location?: string },
  ): Promise<void>;
}

export interface LibraryRepository {
  list(userId: string): Promise<readonly LibraryItem[]>;
  create(document: DocumentRecord): Promise<void>;
  updateSource(id: string, userId: string, data: string): Promise<void>;
  markOpened(id: string, userId: string, openedAt?: Date): Promise<void>;
  getSource(
    id: string,
    userId: string,
  ): Promise<{
    filename: string | null;
    format: "epub" | "pdf";
    data: string;
  } | null>;
}
