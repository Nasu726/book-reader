import { expect, test } from "@playwright/test";

test("library links authenticated users to the document route", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  const library = page.getByRole("region", { name: "Library" });
  if (await library.getByRole("link").count()) {
    await library.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/documents\//);
  } else {
    await expect(library).toContainText("No documents yet");
  }
});

test("document route reports unavailable stored sources safely", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  const response = await page.request.get("/api/documents/missing-document/source");
  expect(response.status()).toBe(404);
});

test("progress API validates and persists stable locations", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");

  const invalid = await page.request.post("/api/documents/missing-document/progress", {
    data: { location: "" },
  });
  expect(invalid.status()).toBe(400);
});

test("PDF sample exposes selectable text and captures normalized intent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("region", { name: "PDF reader" }).getByText("Sample PDF text.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: "PDF reader" }).getByRole("region", { name: "PDF selection preview" })).toBeVisible();
});

test("selection actions preserve captured PDF intent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");

  const samplePdf = Buffer.from(
    "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj5lbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4lRU9G",
    "base64",
  );
  await page.setInputFiles("#document-file", {
    buffer: samplePdf,
    mimeType: "application/pdf",
    name: "selection-sample.pdf",
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL("/");
  const documents = await page.request.get("/api/documents");
  const { documents: records } = (await documents.json()) as {
    documents: { id: string }[];
  };
  await page.goto(`/documents/${records.at(-1)!.id}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  await expect(secondary.getByRole("group", { name: "AI actions" })).toBeVisible();
  await expect(secondary.getByRole("button", { name: "Highlight" })).toBeDisabled();
  await expect(reader.getByText("Select PDF text to prepare it for AI actions.")).toBeVisible();
});

test("PDF selection highlights persist and can be deleted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("e2e-reader-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");

  const samplePdf = Buffer.from(
    "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj5lbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4lRU9G",
    "base64",
  );
  await page.setInputFiles("#document-file", {
    buffer: samplePdf,
    mimeType: "application/pdf",
    name: "persisted-highlight.pdf",
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL("/");
  const documents = await page.request.get("/api/documents");
  const { documents: records } = (await documents.json()) as {
    documents: { id: string }[];
  };

  const created = await page.request.post(`/api/documents/${records.at(-1)!.id}/highlights`, {
    data: {
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "Sample PDF text.",
    },
  });
  expect(created.status()).toBe(201);

  await page.goto(`/documents/${records.at(-1)!.id}`);
  const savedHighlights = page.getByRole("region", { name: "Saved highlights" });
  await expect(savedHighlights.getByText("Sample PDF text.")).toBeVisible();
  await page.reload();
  await expect(savedHighlights.getByText("Sample PDF text.")).toBeVisible();

  await savedHighlights.getByRole("button", { name: /Delete highlight/ }).click();
  await expect(savedHighlights.getByText("No saved highlights.")).toBeVisible();
});
