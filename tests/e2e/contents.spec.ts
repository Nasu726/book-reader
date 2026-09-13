import { expect, test } from "@playwright/test";

import { buildEpub, buildPdf, importDocument, login, type OutlineSpec } from "./helpers";

/**
 * The document's own table of contents: a PDF's outline, an EPUB's navigation.
 * Read, not inferred — a heading guessed from a page's typography is a guess,
 * and a bookmark the author wrote is not.
 */

const OUTLINE: readonly OutlineSpec[] = [
  { title: "Introduction", page: 1 },
  { title: "Methods", page: 3, items: [{ title: "Setup", page: 3 }, { title: "Data", page: 4 }] },
  { title: "Results", page: 7 },
];

/** What the composer sends to the server for the next question. */
async function contextOfNextQuestion(page: import("@playwright/test").Page, question: string) {
  const sent = page.waitForRequest((request) =>
    request.url().endsWith("/api/ai/action") && request.method() === "POST");
  await page.getByLabel("Ask about this passage").fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const body = (await sent).postDataJSON() as { context?: string };
  return body.context ?? "";
}

test("a PDF's own contents are listed, and choosing one goes there", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "outlined.pdf", buildPdf(8, 0, 30, OUTLINE), "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const contents = page.getByRole("combobox", { name: "Contents" });
  await expect(contents).toBeVisible({ timeout: 15_000 });
  // Subsections are indented, in the order the document lists them.
  await expect(contents.locator("option")).toHaveText([
    "Introduction", "Methods", " Setup", " Data", "Results",
  ]);

  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await contents.selectOption({ label: "Results" });
  await expect(pageNumber).toHaveValue("7");

  // Closed, it says where the reader is — including under a subsection whose
  // parent starts on the same page.
  await contents.selectOption({ label: "Methods" });
  await expect(pageNumber).toHaveValue("3");
  await expect(contents).toHaveValue("2");
  await expect(contents.locator("option:checked")).toHaveText(" Setup");
});

test("a question with nothing selected carries the section, not only the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "sectioned.pdf", buildPdf(8, 0, 30, OUTLINE), "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const contents = page.getByRole("combobox", { name: "Contents" });
  await expect(contents).toBeVisible({ timeout: 15_000 });
  await contents.selectOption({ label: " Data" });
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("4");

  // Data runs from page 4 to page 6. Page 6 is two screens down and has not
  // been drawn, so its text has to have been read for the question's sake.
  await expect.poll(
    () => contextOfNextQuestion(page, "What is this section about?"),
    { timeout: 20_000 },
  ).toMatch(/Page 4 of 8[\s\S]*Page 5 of 8[\s\S]*Page 6 of 8/);
  const context = await contextOfNextQuestion(page, "And again?");
  expect(context).toContain("Section: Data");
  expect(context).not.toMatch(/Page 3 of 8|Page 7 of 8/);
});

test("an EPUB's chapters are listed, and one names the question's chapter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "chapters.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  const contents = page.getByRole("combobox", { name: "Contents" });
  await expect(contents.locator("option")).toHaveText(["1. The Analytical Engine", "2. On Reading"]);
  await contents.selectOption({ label: "2. On Reading" });
  await expect(reader.getByText("Beta restoration text.")).toBeVisible();
  await expect(contents).toHaveValue("1");

  const context = await contextOfNextQuestion(page, "What is this chapter about?");
  expect(context).toContain("Section: 2. On Reading");
  expect(context).toContain("Beta restoration text.");
});
