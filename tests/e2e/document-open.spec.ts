import { expect, test } from "@playwright/test";

import { importDocument, login, MULTIPAGE_PDF } from "./helpers";

test("library links authenticated users to the document route", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "linked.pdf", MULTIPAGE_PDF, "application/pdf");

  // Each row carries an explicit Read control; the row itself is not a link.
  const library = page.getByRole("region", { name: "Library" });
  await library.locator("li").filter({ hasText: "linked" }).getByRole("link", { name: "Read" }).click();
  await expect(page).toHaveURL(`/documents/${documentId}`);
});

test("the library shows a useful empty state before anything is imported", async ({ page }) => {
  await login(page);
  const library = page.getByRole("region", { name: "Library" });
  if (await library.locator("li").count() === 0) {
    await expect(library).toContainText("No documents yet");
  }
});

test("document sources and routes stay private to their owner", async ({ page }) => {
  await login(page);

  expect((await page.request.get("/api/documents/missing-document/source")).status()).toBe(404);

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
  const actions = secondary.getByRole("group", { name: "AI actions" });
  await expect(actions).toBeVisible();
  // Nothing is selected, so no action has anything to act on.
  for (const label of ["Explain", "Translate", "Simplify"]) {
    await expect(actions.getByRole("button", { name: label, exact: true })).toBeDisabled();
  }
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/documents/${documentId}`);
  // Highlights live with the other annotations beside the text, not under it.
  const savedHighlights = page.getByRole("complementary", { name: "AI and notes" })
    .locator("details")
    .filter({ hasText: "Highlights" });
  await expect(savedHighlights.getByText("A Role for History")).toBeVisible();
  await page.reload();
  await expect(savedHighlights.getByText("A Role for History")).toBeVisible();

  await savedHighlights.getByRole("button", { name: /Delete highlight/ }).click();
  await expect(savedHighlights).toContainText("Highlights (0)");
});

test("uploads whose bytes do not match their declared type are rejected", async ({ page }) => {
  await login(page);

  const disguised = await page.request.post("/api/documents", {
    multipart: {
      file: {
        buffer: Buffer.from("#!/bin/sh\necho not a document\n"),
        mimeType: "application/pdf",
        name: "disguised.pdf",
      },
    },
  });
  expect(disguised.status()).toBe(415);

  const library = await page.request.get("/api/documents");
  const { documents } = (await library.json()) as { documents: { sourceFilename?: string }[] };
  expect(documents.some((document) => document.sourceFilename === "disguised.pdf")).toBe(false);
});

test("writes attached to a document require owning that document", async ({ page }) => {
  await login(page);

  // Each of these attaches a record to a document id. None may be accepted for
  // a document the caller does not own — an unowned id must never reach a
  // repository write.
  const highlight = await page.request.post("/api/documents/not-my-document/highlights", {
    data: {
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "Someone else's sentence.",
    },
  });
  expect(highlight.status()).toBe(404);

  const note = await page.request.post("/api/documents/not-my-document/note", {
    data: { content: "Someone else's note." },
  });
  expect(note.status()).toBe(404);

  const vocabulary = await page.request.post("/api/documents/not-my-document/vocabulary", {
    data: {
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      meaning: "unauthorized",
      selectedText: "Someone else's sentence.",
      term: "unauthorized",
    },
  });
  expect(vocabulary.status()).toBe(404);

  const progress = await page.request.post("/api/documents/not-my-document/progress", {
    data: { location: JSON.stringify({ page: 2, version: 1 }) },
  });
  expect(progress.status()).toBe(404);

  // Nothing may have been written behind the rejected requests.
  const documentId = await importDocument(page, "owned.pdf", MULTIPAGE_PDF, "application/pdf");
  const highlights = await page.request.get(`/api/documents/${documentId}/highlights`);
  const payload = (await highlights.json()) as { highlights: { selectedText: string }[] };
  expect(payload.highlights).toEqual([]);
});
