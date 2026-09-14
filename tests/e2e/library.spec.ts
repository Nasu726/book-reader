import { expect, test } from "@playwright/test";

import { importDocument, MULTIPAGE_PDF } from "./helpers";

test("a document can be renamed from the library", async ({ page }) => {
  await importDocument(page, "rename-me.pdf", MULTIPAGE_PDF, "application/pdf");

  await page.goto("/");
  const library = page.getByRole("region", { name: "Library" });
  // Once editing starts the title lives in an input value, which `hasText`
  // cannot see, so the form is addressed at page level — only one is ever open.
  const titleField = page.getByRole("textbox", { name: "Title" });
  await library.getByRole("button", { name: "Rename rename-me", exact: true }).click();
  await titleField.fill("Attention Is All You Need");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(library.locator("li").filter({ hasText: "Attention Is All You Need" })).toBeVisible();
  await page.reload();
  await expect(library.locator("li").filter({ hasText: "Attention Is All You Need" })).toBeVisible();
});

test("removing a document frees this device and keeps the notes", async ({ page }) => {
  const documentId = await importDocument(page, "remove-me.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto("/");

  page.on("dialog", (dialog) => void dialog.accept());
  const library = page.getByRole("region", { name: "Library" });
  await library.getByRole("button", { name: "Remove remove-me" }).click();

  await expect(library.locator("li").filter({ hasText: "remove-me" })).toHaveCount(0);
  await page.reload();
  await expect(library.locator("li").filter({ hasText: "remove-me" })).toHaveCount(0);

  // The bytes are gone from this device; the reader says so rather than
  // failing to draw.
  await page.goto(`/read/${documentId}`);
  await expect(page.getByRole("alert")).toContainText("not on this device");
});

test("opening the same file twice is one document, and a rename survives it", async ({ page }) => {
  const first = await importDocument(page, "same.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto("/");
  const library = page.getByRole("region", { name: "Library" });
  await library.getByRole("button", { name: "Rename same", exact: true }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Kuhn");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(library.locator("li").filter({ hasText: "Kuhn" })).toBeVisible();

  // The id is the hash of the bytes, so the same file finds the same record.
  const second = await importDocument(page, "same-again.pdf", MULTIPAGE_PDF, "application/pdf");
  expect(second).toBe(first);
  await page.goto("/");
  await expect(library.locator("li")).toHaveCount(1);
  await expect(library.locator("li").first()).toContainText("Kuhn");
});

test("a file that is neither PDF nor EPUB is refused with a reason", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#document-file", {
    buffer: Buffer.from("not a book"),
    mimeType: "application/pdf",
    name: "fake.pdf",
  });
  await expect(page.getByRole("alert")).toContainText("Only PDF and EPUB files can be opened.");
  await expect(page).toHaveURL("/");
});

test("a note can be written, read back, and cleared", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "noted.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);

  // The note lives with the other things the reader keeps, one tab over.
  const openSaved = async () => page.getByRole("tab", { name: "Notes" }).click();
  await openSaved();
  // Nothing is stored yet, so there is nothing to clear and nothing to save.
  const saveNote = page.getByRole("button", { name: "Save note" });
  await expect(saveNote).toBeDisabled();
  const note = page.getByRole("textbox", { name: "Document note" });
  await note.fill("Kuhn on paradigms.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();

  await page.reload();
  await openSaved();
  await expect(page.getByRole("textbox", { name: "Document note" }))
    .toHaveValue("Kuhn on paradigms.");

  // Anything that can be written has to be removable.
  await page.getByRole("textbox", { name: "Document note" }).fill("");
  await page.getByRole("button", { name: "Clear note" }).click();
  await expect(page.getByText("Note cleared.")).toBeVisible();

  await page.reload();
  await openSaved();
  await expect(page.getByRole("textbox", { name: "Document note" })).toHaveValue("");
});
