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
  getByDocument(documentId: string, userId: string): Promise<{ documentId: string; location: string } | null>;
  save(input: { documentId: string; userId: string; location: string }): Promise<void>;
}

export type HighlightRecord = {
  id: string;
  documentId: string;
  location: string;
  selectedText: string;
  note?: string;
  createdAt: Date;
};

export interface HighlightRepository {
  listByDocument(documentId: string, userId: string): Promise<readonly HighlightRecord[]>;
  create(input: {
    documentId: string;
    userId: string;
    location: string;
    selectedText: string;
    note?: string;
  }): Promise<HighlightRecord>;
  delete(id: string, userId: string): Promise<boolean>;
}

export type DocumentNoteRecord = {
  documentId: string;
  content: string;
  updatedAt: Date;
};

export interface DocumentNoteRepository {
  getByDocument(documentId: string, userId: string): Promise<DocumentNoteRecord | null>;
  save(input: {
    documentId: string;
    userId: string;
    content: string;
  }): Promise<void>;
}

export type VocabularyRecord = {
  id: string;
  documentId: string;
  term: string;
  meaning: string;
  sourceText: string;
  location: string;
  createdAt: Date;
};

export interface VocabularyRepository {
  listByDocument(documentId: string, userId: string): Promise<readonly VocabularyRecord[]>;
  create(input: {
    documentId: string;
    userId: string;
    term: string;
    meaning: string;
    sourceText: string;
    location: string;
  }): Promise<VocabularyRecord>;
  delete(id: string, userId: string): Promise<boolean>;
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
  getByDocument(documentId: string, userId: string): Promise<string | null>;
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
  recordAssistantResponse(input: {
    conversationId: string;
    content: string;
    selectedText?: string;
    location?: string;
  }): Promise<void>;
}

export interface LibraryRepository {
  list(userId: string): Promise<readonly LibraryItem[]>;
  create(document: DocumentRecord): Promise<void>;
  delete(id: string, userId: string): Promise<boolean>;
  updateSource(id: string, userId: string, data: string): Promise<void>;
  updateSourceIfOwned(
    id: string,
    expectedUserId: string,
    data: string,
  ): Promise<boolean>;
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
