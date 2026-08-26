export type DocumentFormat = "epub" | "pdf";

export type StableDocumentLocation = {
  format: DocumentFormat;
  sectionId: string;
  locator?: string;
};

export type ParsedDocumentSection = {
  id: string;
  title?: string;
  /** Readable plain text, used for AI context and as a rendering fallback. */
  content: string;
  /** Sanitized structural markup, used to render the section as the author wrote it. */
  html?: string;
  location?: string;
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

export class DocumentParseError extends Error {
  readonly format?: DocumentFormat;
  readonly filename: string;
  readonly cause?: unknown;

  constructor(options: {
    filename: string;
    format?: DocumentFormat;
    message?: string;
    cause?: unknown;
  }) {
    super(options.message ?? "The document could not be parsed.", {
      cause: options.cause,
    });
    this.name = "DocumentParseError";
    this.format = options.format;
    this.filename = options.filename;
  }
}

export function detectDocumentFormat(filename: string): DocumentFormat | null {
  const extension = filename.toLowerCase().split(".").at(-1);
  return extension === "epub" || extension === "pdf" ? extension : null;
}
