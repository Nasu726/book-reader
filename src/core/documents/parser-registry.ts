import {
  DocumentParseError,
  type DocumentFormat,
  type DocumentParser,
  type ParsedDocument,
} from "./parser.ts";

export class DocumentParserRegistry {
  readonly #parsers = new Map<DocumentFormat, DocumentParser>();

  register(parser: DocumentParser): void {
    for (const format of ["epub", "pdf"] as const) {
      if (parser.supports(format)) {
        this.#parsers.set(format, parser);
      }
    }
  }

  async parse(
    source: ArrayBuffer,
    filename: string,
  ): Promise<ParsedDocument> {
    const extension = filename.toLowerCase().split(".").at(-1);
    const format =
      extension === "epub" || extension === "pdf" ? extension : undefined;
    const parser = format ? this.#parsers.get(format) : undefined;

    if (!format || !parser) {
      throw new DocumentParseError({ filename, format });
    }

    try {
      return await parser.parse(source, filename);
    } catch (cause) {
      if (cause instanceof DocumentParseError) {
        throw cause;
      }
      throw new DocumentParseError({ filename, format, cause });
    }
  }
}
