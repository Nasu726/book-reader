export type DocumentRecord = {
  id: string;
  userId: string;
  title: string;
  format: "epub" | "pdf";
  author?: string;
  sourceFilename?: string;
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
