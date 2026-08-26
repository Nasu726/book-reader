import type { DocumentFormat } from "./parser";

/**
 * Confirms a document's real format from its leading bytes.
 *
 * The Content-Type on an upload is whatever the client claimed, so it decides
 * only which parser gets asked. The bytes decide whether that was true.
 */
export function detectFormatFromBytes(bytes: Uint8Array): DocumentFormat | null {
  // "%PDF-", optionally preceded by junk that real-world PDFs sometimes carry.
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (header.includes("%PDF-")) return "pdf";

  // EPUB is a ZIP whose first entry is an uncompressed "mimetype" file holding
  // exactly "application/epub+zip".
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  if (isZip && header.includes("application/epub+zip")) return "epub";

  return null;
}
