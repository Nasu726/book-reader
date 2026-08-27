import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login, MULTIPAGE_PDF } from "./helpers";

test("a document can be renamed from the library", async ({ page }) => {
  await login(page);
  await importDocument(page, "rename-me.pdf", MULTIPAGE_PDF, "application/pdf");

  const library = page.getByRole("region", { name: "Library" });
  // Other specs share this library, so the row is addressed by its own button.
  // Once editing starts the title lives in an input value, which `hasText`
  // cannot see, so the form is addressed at page level — only one is ever open.
  const titleField = page.getByRole("textbox", { name: "Title" });
  // The button is server-rendered before React attaches its handler, so an
  // early click lands on nothing. Retry until the form actually opens.
  await expect(async () => {
    await library.getByRole("button", { name: "Rename rename-me", exact: true }).click();
    await expect(titleField).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await titleField.fill("Attention Is All You Need");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(library.locator("li").filter({ hasText: "Attention Is All You Need" })).toBeVisible();
  await page.reload();
  await expect(library.locator("li").filter({ hasText: "Attention Is All You Need" })).toBeVisible();
});

test("removing a document deletes its stored bytes as well as its row", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "remove-me.pdf", MULTIPAGE_PDF, "application/pdf");
  expect((await page.request.get(`/api/documents/${documentId}/source`)).status()).toBe(200);

  page.on("dialog", (dialog) => void dialog.accept());
  const library = page.getByRole("region", { name: "Library" });
  await library.getByRole("button", { name: "Remove remove-me" }).click();

  await expect(library.locator("li").filter({ hasText: "remove-me" })).toHaveCount(0);
  expect((await page.request.get(`/api/documents/${documentId}/source`)).status()).toBe(404);
  await page.reload();
  await expect(library.locator("li").filter({ hasText: "remove-me" })).toHaveCount(0);
});

test("rename and delete reject documents the caller does not own", async ({ page }) => {
  await login(page);

  const renamed = await page.request.patch("/api/documents/not-my-document", {
    data: { title: "Stolen" },
  });
  expect(renamed.status()).toBe(404);

  const removed = await page.request.delete("/api/documents/not-my-document");
  expect(removed.status()).toBe(404);
});

test("rename rejects an empty title", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "titled.epub", await buildEpub(), "application/epub+zip");

  const response = await page.request.patch(`/api/documents/${documentId}`, {
    data: { title: "   " },
  });
  expect(response.status()).toBe(400);

  const library = await page.request.get("/api/documents");
  const { documents } = (await library.json()) as { documents: { id: string; title: string }[] };
  // Never opened in the reader, so it still carries the filename stem.
  expect(documents.find((document) => document.id === documentId)?.title).toBe("titled");
});

test("a note can be written, read back, and cleared", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "noted.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const note = page.getByRole("textbox", { name: "Document note" });
  await note.fill("Kuhn on paradigms.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Document note" }))
    .toHaveValue("Kuhn on paradigms.");

  // Anything that can be written has to be removable.
  await page.getByRole("textbox", { name: "Document note" }).fill("");
  await page.getByRole("button", { name: "Clear note" }).click();
  await expect(page.getByText("Note cleared.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("");
});
