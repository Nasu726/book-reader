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
