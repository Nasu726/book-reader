import { Book, type NavItem } from "@likecoin/epub-ts/node";

import {
  DocumentParseError,
  type DocumentParser,
  type ParsedDocument,
  type ParsedDocumentSection,
} from "./parser.ts";
import { sanitizeSectionHtml, toReadableText } from "./html-sanitizer.ts";

type TextDocument = {
  body?: { textContent?: string | null };
  title?: string | null;
};

export type TextDomParserConstructor = new () => {
  parseFromString(markup: string, mimeType: string): TextDocument;
};

function flattenNavigationItems(items: readonly NavItem[]): NavItem[] {
  return items.flatMap((item) => [
    item,
    ...flattenNavigationItems(item.subitems ?? []),
  ]);
}

export class EpubParser implements DocumentParser {
  readonly #domParser: TextDomParserConstructor;

  constructor(domParser: TextDomParserConstructor = globalThis.DOMParser) {
    this.#domParser = domParser;
  }

  supports(format: "epub" | "pdf"): boolean {
    return format === "epub";
  }

  async parse(source: ArrayBuffer, filename: string): Promise<ParsedDocument> {
    let book: Book | undefined;
    const openedPromises: Promise<unknown>[] = [];
    try {
      const openingBook = new Book(source, { replacements: "none" });
      book = openingBook;
      const opened = openingBook.opened;
      openedPromises.push(opened);
      await Promise.allSettled(
        openedPromises.map((promise) => promise.catch(() => undefined)),
      );

      if (!book.isOpen || !book.archive) {
        throw new Error("The EPUB could not be opened.");
      }

      const archiveRequest = book.archive.request.bind(book.archive);
      const navigation = flattenNavigationItems(book.navigation.toc);
      const sections: ParsedDocumentSection[] = [];

      for (const [index, section] of book.spine.spineItems.entries()) {
        await section.load(archiveRequest);
        // Not every DOM implementation exposes `body` for XHTML, so fall back
        // to the document element. The sanitizer drops <head> and its children,
        // so chapter text never picks up the document title either way.
        const root = (section.document?.body ??
          section.document?.documentElement ??
          null) as Parameters<typeof sanitizeSectionHtml>[0];
        const html = sanitizeSectionHtml(root);
        const content = toReadableText(root);
        const navItem = navigation.find(
          (item) => item.href.split("#")[0] === section.href,
        );

        sections.push({
          id: section.idref ?? `section-${index}`,
          title: navItem?.label || undefined,
          content,
          ...(html && { html }),
          location: `spine:${index}:cfi:${section.cfiBase ?? ""}`,
        });
      }

      return {
        format: "epub",
        title: book.packaging.metadata.title || undefined,
        author: book.packaging.metadata.creator || undefined,
        sections,
      };
    } catch (cause) {
      throw cause instanceof DocumentParseError
        ? cause
        : new DocumentParseError({ filename, format: "epub", cause });
    } finally {
      if (book) {
        const pending = [
          ...Object.values(
            (book as typeof book & {
              loading?: Record<string, { promise?: Promise<unknown> }>;
            }).loading ?? {},
          ).map((deferred) => deferred.promise?.catch(() => undefined)),
          (book as unknown as {
            opened?: Promise<unknown>;
          }).opened?.catch(() => undefined),
          ...openedPromises.map((promise) => promise.catch(() => undefined)),
        ].filter((promise): promise is Promise<unknown> => !!promise);
        await Promise.allSettled(pending);
        book.destroy();
      }
    }
  }
}
