export type DocumentFormat = "epub" | "pdf";

export type ParsedDocumentSection = {
  id: string;
  title?: string;
  content: string;
};

export type ParsedDocument = {
  format: DocumentFormat;
  title?: string;
  author?: string;
  sections: readonly ParsedDocumentSection[];
};

export interface DocumentParser {
  supports(format: DocumentFormat): boolean;
  parse(source: ArrayBuffer, filename: string): Promise<ParsedDocument>;
}
