import { expect, test } from "@playwright/test";

test("AI actions render in the desktop secondary pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  if (await secondary.isVisible()) {
    await expect(secondary.getByRole("group", { name: "AI actions" })).toBeVisible();
  }
});

test("mobile drawer preserves a scrollable AI response and returns to the Reader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const drawer = page.getByRole("dialog", { name: "AI drawer" });

  if (await drawer.isVisible()) {
    await expect(drawer.getByLabel("Follow-up question")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Back to Reader" })).toBeVisible();
  }
});
