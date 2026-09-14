import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, MULTIPAGE_PDF, scrollReaderToEnd } from "./helpers";

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

test("PDF journey imports, reads, selects, highlights, and restores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const documentId = await importDocument(page, "journey.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
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

  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Highlight in yellow" }).click();
  // These confirmations wait on a round trip to the development server, which
  // two Playwright workers rendering PDF pages can hold up well past the
  // default five seconds.
  await expect(page.getByText("Highlight saved.")).toBeVisible({ timeout: 15_000 });

  // What the reader wrote lives in its own tab, away from what they marked.
  await page.getByRole("tab", { name: "Notes" }).click();
  const note = page.getByRole("textbox", { name: "Document note" });
  await note.fill("Persisted document note.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("tab", { name: "Marks" }).click();
  await expect(page.getByRole("region", { name: "Saved highlights" })
    .getByText("Structure of Scientific Revolutions")).toBeVisible();

  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Persisted document note.");
});

test("PDF reading position survives a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "pdf-position.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await expect(pageNumber).toHaveValue("1", { timeout: 10_000 });
  await scrollReaderToEnd(page);
  await expect(pageNumber).toHaveValue("2");
  // The save is debounced behind the scroll; give it its moment before the
  // reload that has to find it.
  await page.waitForTimeout(600);

  await page.reload();
  await expect(pageNumber).toHaveValue("2", { timeout: 10_000 });
  await expect(reader.getByText("Normal science means research")).toBeVisible({ timeout: 10_000 });
});

test("EPUB journey renders authored structure and restores the stored position", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const documentId = await importDocument(
    page,
    "journey.epub",
    await buildEpub(),
    "application/epub+zip",
  );

  await page.goto(`/read/${documentId}`);
  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  // The book's own title replaces the filename once the browser has parsed
  // it. Polled at the library, since the rename lands a moment after the text.
  await expect.poll(async () => {
    await page.goto("/");
    return page.getByRole("region", { name: "Library" }).textContent();
  }, { timeout: 15_000 }).toContain("Notes on Thinking Machines");
  await page.goto(`/read/${documentId}`);
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  // Authored structure must survive the import: a real heading element, real
  // paragraphs, and no <head><title> text leaking into the chapter.
  await expect(reader.locator("h1")).toHaveText("1. The Analytical Engine");
  await expect(reader.locator("p")).toHaveCount(2);
  await expect(reader.locator("article")).not.toContainText("ch1");

  await reader.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible();
  // The save is debounced a quarter of a second behind the navigation.
  await page.waitForTimeout(600);

  await page.reload();
  await expect(reader.getByText("Beta restoration text.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("EPUB chapters cannot execute authored scripts", async ({ page }) => {
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

  await page.goto(`/read/${documentId}`);
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main", { name: "Reader" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
