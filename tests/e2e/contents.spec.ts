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

test("an EPUB's chapters are listed, and choosing one goes there", async ({ page }) => {
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
});
