export type DocumentRecord = {
  id: string;
  title: string;
  format: "epub" | "pdf";
  author?: string;
};

export interface DocumentRepository {
  list(): Promise<readonly DocumentRecord[]>;
}
