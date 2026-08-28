import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login, MULTIPAGE_PDF, scrollReaderToEnd } from "./helpers";

// The server runs with AI_PROVIDER=mock, so these journeys exercise the real
// /api/ai/action route — authentication, conversation persistence and all —
// instead of a browser-level stub that would skip the server entirely.
const MOCK_AI_RESPONSE = "Mock AI response.";

/** Selects the title line on page 1, the way a reader drags across it. */
async function selectPassage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = Array.from(document.querySelectorAll(".textLayer span"))
      .find((node) => node.textContent?.includes("Structure of Scientific Revolutions"));
    if (!target) throw new Error("PDF text node not found.");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return target.textContent;
  });
}

test("PDF journey imports, reads, selects, acts, highlights, and restores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const documentId = await importDocument(page, "journey.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);
  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("This PDF page could not be rendered.")).toBeHidden({ timeout: 10_000 });

  await expect(reader.getByText("Structure of Scientific Revolutions")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[aria-label="PDF reader"] [data-page-number="1"] .textLayer')).toHaveCount(1);
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 10_000 },
  );

  const selectedText = await selectPassage(page);
  expect(selectedText).toContain("Structure of Scientific Revolutions");

  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  const actions = secondary.getByRole("group", { name: "AI actions" });
  for (const action of ["Explain", "Translate", "Simplify"]) {
    await actions.getByRole("button", { name: action, exact: true }).click();
    await expect(secondary.getByRole("region", { name: "AI response" }).first())
      .toContainText(MOCK_AI_RESPONSE, { timeout: 15_000 });
  }
  await secondary.getByLabel("Follow-up question").fill("Why does this matter?");
  await secondary.getByRole("button", { name: "Ask", exact: true }).last().click();
  await expect(secondary.getByRole("region", { name: "AI response" }).first())
    .toContainText(MOCK_AI_RESPONSE, { timeout: 15_000 });

  // Highlighting lives against the passage now, so the selection the AI actions
  // consumed has to be made again — clicking in the pane clears it, exactly as
  // it would for a reader.
  await selectPassage(page);
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Highlight in yellow" }).click();
  // The same allowance the AI assertions above use. These confirmations wait on
  // a round trip to the development server, which two Playwright workers
  // rendering PDF pages can hold up well past the default five seconds.
  await expect(page.getByText("Highlight saved.")).toBeVisible({ timeout: 15_000 });
  const note = page.getByRole("textbox", { name: "Document note" });
  await note.fill("Persisted document note.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible({ timeout: 15_000 });
  const vocabularySection = page.getByRole("region", { name: "Saved vocabulary" });
  await vocabularySection.getByRole("textbox", { name: "Meaning" }).fill("A short demonstration sentence.");
  await vocabularySection.getByRole("button", { name: "Save vocabulary" }).click();
  await expect(page.getByText("Vocabulary saved.")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole("complementary", { name: "AI and notes" })
    .locator("details").filter({ hasText: "Highlights" })
    .getByText("Structure of Scientific Revolutions")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Persisted document note.");
  const savedVocabulary = page.getByRole("region", { name: "Saved vocabulary" }).locator("li");
  await expect(savedVocabulary).toHaveCount(1);
  await expect(savedVocabulary).toContainText("A short demonstration sentence.");
});

test("PDF reading position survives a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "pdf-position.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await expect(pageNumber).toHaveValue("1", { timeout: 10_000 });
  await scrollReaderToEnd(page);
  await expect(pageNumber).toHaveValue("2");
  // The save that carries page 2, not merely any progress request. Polled
  // rather than waited on: the request may already have gone out by the time
  // the page number settles.
  await expect.poll(async () => {
    const response = await page.request.get(`/api/documents/${documentId}/progress`);
    return (await response.json()) as { location: string | null };
  }, { timeout: 15_000 }).toEqual({ location: JSON.stringify({ page: 2, version: 1 }) });

  await page.reload();
  await expect(pageNumber).toHaveValue("2", { timeout: 10_000 });
  await expect(reader.getByText("Normal science means research")).toBeVisible({ timeout: 10_000 });
});

test("EPUB journey renders authored structure and restores the stored position", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const documentId = await importDocument(
    page,
    "journey.epub",
    await buildEpub(),
    "application/epub+zip",
  );

  await page.goto(`/documents/${documentId}`);
  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  // The book's own title replaces the uploaded filename once the browser has
  // parsed it; the server never opens the file. That rename is a request of its
  // own, so wait for it rather than racing it to the library.
  await expect.poll(async () => {
    const response = await page.request.get("/api/documents");
    const { documents } = (await response.json()) as { documents: { id: string; title: string }[] };
    return documents.find((document) => document.id === documentId)?.title;
  }, { timeout: 15_000 }).toBe("Notes on Thinking Machines");

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Library" }))
    .toContainText("Notes on Thinking Machines");
  await page.goto(`/documents/${documentId}`);
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  // Authored structure must survive the import: a real heading element, real
  // paragraphs, and no <head><title> text leaking into the chapter.
  await expect(reader.locator("h1")).toHaveText("1. The Analytical Engine");
  await expect(reader.locator("p")).toHaveCount(2);
  await expect(reader.locator("article")).not.toContainText("ch1");

  await reader.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible();
  await page.waitForResponse((response) =>
    response.url().includes("/progress") && response.request().method() === "POST");

  await page.reload();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("EPUB chapters cannot execute authored scripts", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(
    page,
    "hostile.epub",
    await buildEpub({
      title: "Hostile Book",
      chapters: [{
        id: "ch1",
        label: "Hostile chapter",
        body: '<h1>Hostile chapter</h1><p onclick="globalThis.__pwned = true">Body text.</p>'
          + '<script>globalThis.__pwned = true;</script>'
          + '<img src="x" onerror="globalThis.__pwned = true" />',
      }],
    }),
    "application/epub+zip",
  );

  await page.goto(`/documents/${documentId}`);
  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Body text.")).toBeVisible({ timeout: 10_000 });
  await reader.getByText("Body text.").click();

  expect(await page.evaluate(() => "__pwned" in globalThis)).toBe(false);
  await expect(reader.locator("article")).not.toContainText("__pwned");
  await expect(reader.locator("img")).toHaveCount(0);
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
  await expect(page.getByRole("main", { name: "Reader" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
