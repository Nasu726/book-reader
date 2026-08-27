import { parseHTML } from "linkedom";

import { EpubParser } from "@/core/documents/epub-parser";
import type { ParsedDocument } from "@/core/documents/parser";

/** Server-side DOM for EPUB chapters; the browser DOMParser is unavailable here. */
class LinkedomTextParser {
  parseFromString(markup: string) {
    return parseHTML(markup).document;
  }
}

export function parseEpub(
  source: ArrayBuffer,
  filename: string,
): Promise<ParsedDocument> {
  return new EpubParser(LinkedomTextParser).parse(source, filename);
}

/**
 * Best-effort title/author for the library listing. A document that cannot be
 * parsed is still importable — it just keeps its filename as the title.
 */
export async function readEpubMetadata(
  bytes: Uint8Array,
  filename: string,
): Promise<{ title?: string; author?: string } | null> {
  try {
    const parsed = await parseEpub(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      filename,
    );
    return { title: parsed.title, author: parsed.author };
  } catch {
    return null;
  }
}
