import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login } from "./helpers";

async function openBook(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "tabs.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });
}

test("what the reader saves is a separate panel from what the AI answers", async ({ page }) => {
  await openBook(page);

  // AI first: the pane opens on the thing a selection acts on.
  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "AI actions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeHidden();

  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved vocabulary" })).toBeVisible();
  await expect(page.getByRole("group", { name: "AI actions" })).toBeHidden();
});

test("a half-typed note survives a trip to the other tab", async ({ page }) => {
  await openBook(page);

  await page.getByRole("tab", { name: "Saved" }).click();
  await page.getByRole("textbox", { name: "Document note" }).fill("Unsaved thought.");
  await page.getByRole("tab", { name: "AI" }).click();
  await page.getByRole("tab", { name: "Saved" }).click();

  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Unsaved thought.");
});

test("the arrow keys move between tabs instead of turning the page", async ({ page }) => {
  await openBook(page);
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.getByRole("tab", { name: "AI" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Saved" })).toHaveAttribute("aria-selected", "true");
  // Still on the same chapter: the tab bar kept the key to itself.
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("an action chosen at the selection brings its answer's tab forward", async ({ page }) => {
  await openBook(page);
  await page.getByRole("tab", { name: "Saved" }).click();

  await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll("article p"))
      .find((node) => node.textContent?.includes("Alpha journey text."));
    const range = document.createRange();
    range.selectNodeContents(paragraph!.firstChild!);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Explain", exact: true }).click();

  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "AI response" }).first())
    .toContainText("Mock AI response.", { timeout: 15_000 });
});
