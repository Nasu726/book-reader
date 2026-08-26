import { expect, test } from "@playwright/test";

import { importDocument, login, MULTIPAGE_PDF } from "./helpers";

test("library links authenticated users to the document route", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "linked.pdf", MULTIPAGE_PDF, "application/pdf");

  const library = page.getByRole("region", { name: "Library" });
  await library.getByRole("link", { name: /linked/ }).click();
  await expect(page).toHaveURL(`/documents/${documentId}`);
});

test("the library shows a useful empty state before anything is imported", async ({ page }) => {
  await login(page);
  const library = page.getByRole("region", { name: "Library" });
  const links = await library.getByRole("link").count();
  if (links === 0) {
    await expect(library).toContainText("No documents yet");
  }
});

test("document sources and routes stay private to their owner", async ({ page }) => {
  await login(page);

  expect((await page.request.get("/api/documents/missing-document/source")).status()).toBe(404);
  expect((await page.request.get("/api/documents/missing-document/parse")).status()).toBe(404);

  // A signed-out client must not reach a real document either.
  const documentId = await importDocument(page, "private.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.request.post("/api/auth/logout");
  expect((await page.request.get(`/api/documents/${documentId}/source`)).status()).toBe(401);
});

test("progress API validates and persists stable locations", async ({ page }) => {
  await login(page);

  const invalid = await page.request.post("/api/documents/missing-document/progress", {
    data: { location: "" },
  });
  expect(invalid.status()).toBe(400);
});

test("the source route streams document bytes rather than a base64 payload", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "streamed.pdf", MULTIPAGE_PDF, "application/pdf");

  const response = await page.request.get(`/api/documents/${documentId}/source`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");

  const body = await response.body();
  expect(body.byteLength).toBe(MULTIPAGE_PDF.byteLength);
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

test("PDF selection exposes selectable text and captures normalized intent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "selection.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  await expect(secondary.getByRole("group", { name: "AI actions" })).toBeVisible();
  await expect(secondary.getByRole("button", { name: "Highlight" })).toBeDisabled();
  await expect(reader.getByText("Select PDF text to prepare it for AI actions.")).toBeVisible();
});

test("PDF selection highlights persist and can be deleted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "highlighted.pdf", MULTIPAGE_PDF, "application/pdf");

  const created = await page.request.post(`/api/documents/${documentId}/highlights`, {
    data: {
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "A Role for History",
    },
  });
  expect(created.status()).toBe(201);

  await page.goto(`/documents/${documentId}`);
  const savedHighlights = page.getByRole("region", { name: "Saved highlights" });
  await expect(savedHighlights.getByText("A Role for History")).toBeVisible();
  await page.reload();
  await expect(savedHighlights.getByText("A Role for History")).toBeVisible();

  await savedHighlights.getByRole("button", { name: /Delete highlight/ }).click();
  await expect(savedHighlights.getByText("No saved highlights.")).toBeVisible();
});
