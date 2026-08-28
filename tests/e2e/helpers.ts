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

/**
 * A PDF of `pageCount` pages, assembled here rather than checked in.
 *
 * Memory behaviour only shows up over a document long enough to scroll through:
 * two pages fit in a phone's canvas budget however carelessly they are handled.
 */
export function buildPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const pageIds = Array.from({ length: pageCount }, (_, index) => 3 + index);
  const fontId = 3 + pageCount;
  const contentIds = pageIds.map((_, index) => fontId + 1 + index);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  pageIds.forEach((id, index) => {
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
      + `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  contentIds.forEach((id, index) => {
    const stream = `BT\n/F1 24 Tf\n1 0 0 1 60 700 Tm\n(Page ${index + 1} of ${pageCount}) Tj\nET`;
    objects[id] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/**
 * Names an action in the composer and sends it.
 *
 * The buttons write `/explain` into the input rather than sending, because the
 * composer is the only thing that sends: asking about a passage and asking a
 * question of your own are then the same gesture.
 */
export async function runAction(
  page: Page,
  action: "explain" | "translate" | "simplify",
): Promise<void> {
  await page.getByRole("button", { name: `Insert /${action}` }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/**
 * Pushes the sheet back down with a swipe, the way the grip at its top says it
 * can be. There is no Close button: a grip that cannot be dragged is a promise
 * the interface does not keep.
 */
export async function swipeSheetDown(page: Page): Promise<void> {
  const grip = page.getByRole("dialog", { name: "AI drawer" }).locator("div").first();
  const box = await grip.boundingBox();
  if (!box) throw new Error("The sheet has no grip to drag.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const step of [40, 90, 150, 220]) await page.mouse.move(x, y + step);
  await page.mouse.up();
}
