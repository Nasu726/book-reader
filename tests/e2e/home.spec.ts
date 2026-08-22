import { expect, test } from "@playwright/test";

test("renders the reader foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AI Reader" })).toBeVisible();
  await expect(page.getByText("Foundation ready.")).toBeVisible();
});
