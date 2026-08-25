import { expect, test } from "@playwright/test";
import JSZip from "jszip";

const SAMPLE_PDF = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNTg+PnN0cmVhbQpCVCAvRjEgMjQgVGYgNzIgNzIwIFRkIChTYW1wbGUgUERGIHRleHQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G",
  "base64",
);

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

async function importDocument(page: import("@playwright/test").Page, name: string, file: Buffer, mimeType: string) {
  const upload = page.waitForResponse((response) => response.url().endsWith("/api/documents"));
  await page.setInputFiles("#document-file", { buffer: file, mimeType, name });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await upload;
  await expect(page).toHaveURL("/");
  const documents = await page.request.get("/api/documents");
  const payload = (await documents.json()) as { documents: { id: string }[] };
  return payload.documents.at(-1)!.id;
}

test.beforeEach(async ({ context }) => {
  await context.route("**/api/ai/action", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { prompt?: string };
    if (!body.prompt?.includes("Selected text:")) {
      await route.fulfill({ status: 400, body: "Missing selection." });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ content: `Mocked ${body.prompt.split("\n")[0]}` }) });
  });
});

test("PDF journey imports, reads, selects, acts, highlights, and restores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") console.log("BROWSER", message.type(), message.text());
  });
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  await login(page);

  const documentId = await importDocument(page, "journey.pdf", SAMPLE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);
  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("This PDF page could not be rendered.")).toBeHidden({ timeout: 10_000 });

  await expect(reader.getByText("Sample PDF text.")).toBeVisible({ timeout: 10_000 });
  const textLayer = page.locator('[aria-label="PDF reader"] .textLayer');
  await expect(textLayer).toHaveCount(1);
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 10_000 },
  );
  const selection = page.evaluate(() => {
    const target = Array.from(document.querySelectorAll(".textLayer span"))
      .find((node) => node.textContent === "Sample PDF text.");
    if (!target) throw new Error("PDF text node not found.");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return target.textContent;
  });
  await expect(selection).resolves.toBe("Sample PDF text.");

  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  for (const action of ["Explain", "Translate", "Simplify"]) {
    await secondary.getByRole("button", { name: action }).click();
    await expect(secondary.getByRole("region", { name: "AI response" }).first()).toContainText(`Mocked`);
  }
  await secondary.getByLabel("Follow-up question").fill("Why does this matter?");
  await secondary.getByRole("button", { name: "Ask", exact: true }).last().click();
  await expect(secondary.getByRole("region", { name: "AI response" }).first()).toContainText("Mocked");

  await secondary.getByRole("button", { name: "Highlight" }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible();
  const note = page.getByRole("textbox", { name: "Document note" });
  await note.fill("Persisted document note.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  const vocabularySection = page.getByRole("region", { name: "Saved vocabulary" });
  await vocabularySection.getByRole("textbox", { name: "Meaning" }).fill("A short demonstration sentence.");
  await vocabularySection.getByRole("button", { name: "Save vocabulary" }).click();
  await expect(page.getByText("Vocabulary saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved highlights" }).getByText("Sample PDF text.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Persisted document note.");
  const savedVocabulary = page.getByRole("region", { name: "Saved vocabulary" }).locator("li");
  await expect(savedVocabulary).toHaveCount(1);
  await expect(savedVocabulary).toContainText("Sample PDF text.");
  await expect(savedVocabulary).toContainText("A short demonstration sentence.");
});

test("EPUB journey restores the stored reading position after reload", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/content.opf",
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Journey Book</dc:title><dc:identifier id="id">journey</dc:identifier></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="s1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="s2" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="s1"/><itemref idref="s2"/></spine></package>',
  );
  zip.file(
    "OEBPS/nav.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Navigation</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">First</a></li><li><a href="chapter2.xhtml">Second</a></li></ol></nav></body></html>',
  );
  zip.file(
    "OEBPS/chapter1.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Alpha journey text.</p></body></html>',
  );
  zip.file(
    "OEBPS/chapter2.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Beta restoration text.</p></body></html>',
  );
  const epub = Buffer.from(await zip.generateAsync({ type: "arraybuffer" }));
  const documentId = await importDocument(page, "journey.epub", epub, "application/epub+zip");

  await page.goto(`/documents/${documentId}`);
  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });
  const secondSectionSaved = page.waitForResponse((response) =>
    response.url().includes("/progress") &&
    response.request().method() === "POST" &&
    Boolean(response.request().postData()?.includes("s2")),
  );
  await reader.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible();
  await secondSectionSaved;
  await expect(page.getByText("2 / 2")).toBeVisible();

  await page.reload();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("Chrome QA records no critical console errors across responsive journeys", async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Reader", exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
