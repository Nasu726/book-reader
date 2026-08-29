import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login } from "./helpers";

async function openBook(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "tabs.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });
}

test("the conversation, the notes and the marks are three separate panels", async ({ page }) => {
  await openBook(page);

  // AI first: the pane opens on the thing a selection acts on.
  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "AI actions" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeHidden();

  // What the reader wrote. A book with thirty marks used to push all of this
  // off the bottom of the panel they shared.
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved vocabulary" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeHidden();
  await expect(page.getByRole("group", { name: "AI actions" })).toBeHidden();

  // What the reader marked.
  await page.getByRole("tab", { name: "Marks" }).click();
  await expect(page.getByRole("region", { name: "Saved highlights" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document note" })).toBeHidden();
});

test("a half-typed note survives a trip to the other tab", async ({ page }) => {
  await openBook(page);

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: "Document note" }).fill("Unsaved thought.");
  await page.getByRole("tab", { name: "AI" }).click();
  await page.getByRole("tab", { name: "Notes" }).click();

  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("Unsaved thought.");
});

test("the arrow keys move between tabs instead of turning the page", async ({ page }) => {
  await openBook(page);
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.getByRole("tab", { name: "AI" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  // Still on the same chapter: the tab bar kept the key to itself.
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  // And round, which is what a tab list does.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Marks" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("an action chosen at the selection brings its answer's tab forward", async ({ page }) => {
  await openBook(page);
  await page.getByRole("tab", { name: "Notes" }).click();

  await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll("article p"))
      .find((node) => node.textContent?.includes("Alpha journey text."));
    const range = document.createRange();
    range.selectNodeContents(paragraph!.firstChild!);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    // Dispatched inside the book: letting go of a passage is something the
    // reader does there, and the pane beside it no longer listens at all.
    paragraph!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  // From the menu against the passage, not from the composer: the composer is
  // in the tab this test is checking gets brought forward.
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Explain", exact: true }).click();

  await expect(page.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "AI response" }).first())
    .toContainText("Mock AI response.", { timeout: 15_000 });
});
