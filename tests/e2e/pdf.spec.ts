import { expect, test } from "@playwright/test";

test("PDF renders with navigation and selectable text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const reader = page.getByRole("region", { name: "PDF reader" });
  if (await reader.isVisible()) {
    await expect(reader.getByText("Page 1 / 1")).toBeVisible({ timeout: 10_000 });
    await expect(reader.locator("canvas")).toBeVisible();
    await expect(reader.getByText("Sample PDF text.")).toBeVisible({ timeout: 10_000 });
    await expect(reader.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(reader.getByRole("button", { name: "Next" })).toBeDisabled();
  }
});
