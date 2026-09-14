import { expect, test } from "@playwright/test";

import { buildEpub, importDocument } from "./helpers";

async function openBook(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "tabs.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/read/${documentId}`);
  await expect(page.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });
}

test("the marks and the notes are two separate panels", async ({ page }) => {
  await openBook(page);

  // Marks first: the pane opens on what a selection adds to.
  await expect(page.getByRole("tab", { name: "Marks" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeHidden();

  // What the reader wrote. A book with thirty marks used to push all of this
  // off the bottom of the panel they shared.
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeHidden();
});

test("a half-typed note survives a trip to the other tab", async ({ page }) => {
  await openBook(page);

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: "Document note" }).fill("Unsaved thought.");
  await page.getByRole("tab", { name: "Marks" }).click();
  await page.getByRole("tab", { name: "Notes" }).click();

  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Unsaved thought.");
});

test("the arrow keys move between tabs instead of turning the page", async ({ page }) => {
  await openBook(page);
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.getByRole("tab", { name: "Marks" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  // Still on the same chapter: the tab bar kept the key to itself.
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Marks" })).toHaveAttribute("aria-selected", "true");
  // And round, which is what a tab list does.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1 / 2")).toBeVisible();
});
