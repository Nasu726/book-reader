"use client";

import { Book } from "@likecoin/epub-ts";

import { EpubParser } from "@/core/documents/epub-parser";
import type { ParsedDocument } from "@/core/documents/parser";

/**
 * Parses an EPUB in the browser.
 *
 * The server used to do this on every open. A Cloudflare Worker on the free
 * plan gets 10ms of CPU per request, which a whole book does not fit into, and
 * epub-ts plus a server DOM would push the Worker past its 3 MiB bundle limit.
 * The browser already has a DOM and no such budget, and reflowing the text is
 * its job anyway.
 */
export async function parseEpubInBrowser(
  source: ArrayBuffer,
  filename: string,
): Promise<ParsedDocument> {
  return new EpubParser(
    globalThis.DOMParser,
    Book as unknown as ConstructorParameters<typeof EpubParser>[1],
  ).parse(source, filename);
}
