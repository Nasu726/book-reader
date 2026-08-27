import { expect, type Page } from "@playwright/test";
import JSZip from "jszip";

import { E2E_PASSWORD, E2E_USERNAME } from "./environment";

/** Two pages of real prose, so navigation and text extraction have something to assert on. */
export const MULTIPAGE_PDF = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA0IDAgUl0gL0NvdW50IDIgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNyAwIFIgPj4KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago2IDAgb2JqCjw8IC9MZW5ndGggMzQ2ID4+CnN0cmVhbQpCVAovRjEgMTQgVGYKMSAwIDAgMSA2MCA3NDAgVG0KMjAgVEwKKFRoZSBTdHJ1Y3R1cmUgb2YgU2NpZW50aWZpYyBSZXZvbHV0aW9ucykgVGogVCoKKENoYXB0ZXIgMTogSW50cm9kdWN0aW9uKSBUaiBUKgooQSBSb2xlIGZvciBIaXN0b3J5KSBUaiBUKgooSGlzdG9yeSwgaWYgdmlld2VkIGFzIGEgcmVwb3NpdG9yeSBmb3IgbW9yZSB0aGFuKSBUaiBUKgooYW5lY2RvdGUgb3IgY2hyb25vbG9neSwgY291bGQgcHJvZHVjZSBhIGRlY2lzaXZlKSBUaiBUKgoodHJhbnNmb3JtYXRpb24gaW4gdGhlIGltYWdlIG9mIHNjaWVuY2UgYnkgd2hpY2ggd2UpIFRqIFQqCihhcmUgbm93IHBvc3Nlc3NlZC4pIFRqIFQqCkVUCmVuZHN0cmVhbQplbmRvYmoKNyAwIG9iago8PCAvTGVuZ3RoIDMwNCA+PgpzdHJlYW0KQlQKL0YxIDE0IFRmCjEgMCAwIDEgNjAgNzQwIFRtCjIwIFRMCihQYWdlIDIpIFRqIFQqCihOb3JtYWwgc2NpZW5jZSBtZWFucyByZXNlYXJjaCBmaXJtbHkgYmFzZWQgdXBvbikgVGogVCoKKG9uZSBvciBtb3JlIHBhc3Qgc2NpZW50aWZpYyBhY2hpZXZlbWVudHMsIHRoYXQgc29tZSkgVGogVCoKKHBhcnRpY3VsYXIgc2NpZW50aWZpYyBjb21tdW5pdHkgYWNrbm93bGVkZ2VzIGZvciBhKSBUaiBUKgoodGltZSBhcyBzdXBwbHlpbmcgdGhlIGZvdW5kYXRpb24gZm9yIGl0cyBmdXJ0aGVyKSBUaiBUKgoocHJhY3RpY2UuKSBUaiBUKgpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0NyAwMDAwMCBuIAowMDAwMDAwMzczIDAwMDAwIG4gCjAwMDAwMDA0NDMgMDAwMDAgbiAKMDAwMDAwMDg0MCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDggL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjExOTUKJSVFT0YK",
  "base64",
);

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USERNAME);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

export async function importDocument(
  page: Page,
  name: string,
  file: Buffer,
  mimeType: string,
): Promise<string> {
  // Choosing a file submits the form, but that submit is wired up by React, so
  // a file set before hydration silently does nothing. Retry until the upload
  // actually leaves rather than waiting out a request that was never made.
  await expect(async () => {
    const upload = page.waitForResponse(
      (response) => response.url().endsWith("/api/documents"),
      { timeout: 5_000 },
    );
    await page.setInputFiles("#document-file", { buffer: file, mimeType, name });
    await upload;
  }).toPass({ timeout: 40_000 });
  await expect(page).toHaveURL("/");
  const documents = await page.request.get("/api/documents");
  const payload = (await documents.json()) as { documents: { id: string; sourceFilename?: string }[] };
  const imported = payload.documents.find((document) => document.sourceFilename === name);
  if (!imported) throw new Error(`Imported document ${name} is missing from the library.`);
  return imported.id;
}

/** A structurally valid EPUB with headings and paragraphs, built in memory. */
export async function buildEpub(options?: {
  title?: string;
  chapters?: readonly { id: string; label: string; body: string }[];
}): Promise<Buffer> {
  const title = options?.title ?? "Notes on Thinking Machines";
  const chapters = options?.chapters ?? [
    {
      id: "ch1",
      label: "1. The Analytical Engine",
      body: "<h1>1. The Analytical Engine</h1><p>Alpha journey text.</p><p>It can follow analysis.</p>",
    },
    {
      id: "ch2",
      label: "2. On Reading",
      body: "<h1>2. On Reading</h1><p>Beta restoration text.</p>",
    },
  ];

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>A. Lovelace</dc:creator><dc:identifier id="id">urn:uuid:e2e</dc:identifier></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters
      .map((chapter) => `<item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`)
      .join("")}</manifest><spine>${chapters
      .map((chapter) => `<itemref idref="${chapter.id}"/>`)
      .join("")}</spine></package>`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${chapters
      .map((chapter) => `<li><a href="${chapter.id}.xhtml">${chapter.label}</a></li>`)
      .join("")}</ol></nav></body></html>`,
  );
  for (const chapter of chapters) {
    zip.file(
      `OEBPS/${chapter.id}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.id}</title></head><body>${chapter.body}</body></html>`,
    );
  }
  return Buffer.from(await zip.generateAsync({ type: "arraybuffer" }));
}

/** Scrolls the reading pane to the end, once the pages have height to scroll. */
export async function scrollReaderToEnd(page: Page): Promise<void> {
  // Scrolling before the pages exist moves nothing: the column is still as tall
  // as the viewport, so scrollHeight and clientHeight are the same number.
  await page.waitForFunction(() => {
    const column = document.querySelector("[data-reader-scroll]");
    return !!column && column.scrollHeight > column.clientHeight + 50;
  }, undefined, { timeout: 15_000 });
  await page.evaluate(() => {
    const column = document.querySelector("[data-reader-scroll]")!;
    column.scrollTop = column.scrollHeight;
  });
}
