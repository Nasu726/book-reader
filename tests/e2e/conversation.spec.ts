import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login, runAction } from "./helpers";

// A distinct filename per test: importDocument resolves a document by the name
// it was uploaded under, so a shared one would hand every test the same
// conversation.
async function openBookAndSelect(page: import("@playwright/test").Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, `${name}.epub`, await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);
  // Scoped to the book: once there is a conversation, the transcript quotes
  // the same passage back.
  await expect(page.getByRole("region", { name: "EPUB reader" })
    .getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

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
  return documentId;
}

test("the panel follows the book's selection, and only the book's", async ({ page }) => {
  await openBookAndSelect(page, "talk-subject");
  const composer = page.getByRole("complementary", { name: "AI and notes" });
  await expect(composer).toContainText("Alpha journey text.");

  await runAction(page, "explain");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(1, { timeout: 15_000 });

  // Acting in the panel does not count as letting go of the passage, so a
  // paragraph that was explained can then be translated. Every click used to
  // report "nothing is selected" and disable the lot.
  await expect(composer).toContainText("Alpha journey text.");
  await runAction(page, "translate");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(2, { timeout: 15_000 });

  // Letting go in the book does. The panel must not go on offering a passage
  // the reader can no longer see they have chosen.
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.querySelector("article")!
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(composer).toContainText("No passage selected");
  await page.getByRole("button", { name: "Insert /explain" }).click();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("a reopened conversation reads as a conversation, not as prompts", async ({ page }) => {
  await openBookAndSelect(page, "talk-history");

  await runAction(page, "explain");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(1, { timeout: 15_000 });

  await page.reload();
  const transcript = page.getByRole("log", { name: "Conversation" });
  await expect(transcript).toContainText("Mock AI response.", { timeout: 15_000 });
  // The reader's side is what they asked for, in their words.
  await expect(transcript).toContainText("Explain");
  // Not the instruction that was built for the provider. Keeping the prompt was
  // why asking one question replayed every prompt that came before it.
  await expect(transcript).not.toContainText("clearly and concisely");
  await expect(transcript).not.toContainText("Selected text:");
});

test("the conversation can be thrown away", async ({ page }) => {
  const documentId = await openBookAndSelect(page, "talk-clear");

  await runAction(page, "explain");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(0);

  // Asked of the server, not of the screen. An empty transcript is also what
  // the page shows for the moment before the stored history arrives, so
  // reloading and looking at it would pass whether or not anything was deleted.
  await expect.poll(async () => {
    const response = await page.request.get(`/api/ai/action?documentId=${documentId}`);
    return ((await response.json()) as { messages: unknown[] }).messages.length;
  }, { timeout: 10_000 }).toBe(0);

  await page.reload();
  await page.waitForResponse((response) =>
    response.url().includes("/api/ai/action?documentId=") && response.request().method() === "GET");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(0);
});

test("an answer worth keeping goes into the document note", async ({ page }) => {
  await openBookAndSelect(page, "talk-notes");

  await runAction(page, "explain");
  await expect(page.getByRole("region", { name: "AI response" })).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole("button", { name: "Save to notes" }).click();
  await expect(page.getByRole("button", { name: "Saved to notes" })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(page.getByRole("textbox", { name: "Document note" }))
    .toHaveValue(/Mock AI response\./, { timeout: 15_000 });
});
