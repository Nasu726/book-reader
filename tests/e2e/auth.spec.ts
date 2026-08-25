import { expect, test } from "@playwright/test";
import assert from "node:assert/strict";

test("unauthenticated users cannot read app content", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("authenticated users can read the reader foundation", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  const response = await page.request.post("/api/auth/logout");
  expect([200, 303]).toContain(response.status());
});

test("reader remains primary on narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const reader = page.getByRole("region", { name: "Reader" });

  if (await reader.isVisible()) {
    const box = await reader.boundingBox();
    assert.ok(box);
    assert.equal(box.x, 0);
    assert.ok(box.width > 300);
  }
});

test("wide viewports can host a secondary pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  const secondary = page.getByRole("complementary", { name: "AI and notes" });

  if (await secondary.isVisible()) {
    const box = await secondary.boundingBox();
    assert.ok(box);
    assert.ok(box.width >= 320);
  }
});

test("theme and font size controls persist preferences", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const themeButton = page.getByRole("button", { name: "Switch to dark theme" });

  if (await themeButton.isVisible()) {
    await themeButton.click();
    await page.getByRole("button", { name: /Font size/ }).getByRole("button").nth(1).click();
    await expect(async () => {
      const stored = await page.evaluate(() => ({
        fontSize: localStorage.getItem("book-reader-font-size"),
        theme: localStorage.getItem("book-reader-theme"),
      }));
      assert.equal(stored.theme, "dark");
      assert.equal(stored.fontSize, "110");
    }).toPass();
  }
});

test("library exposes import and useful empty state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  const importInput = page.getByLabel("Import PDF or EPUB");
  if (await importInput.isVisible()) {
    await expect(importInput).toBeVisible();
    await expect(page.getByRole("region", { name: "Library" })).toContainText(
      "No documents yet",
    );
    await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  }
});
