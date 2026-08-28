import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("the manual is reachable without signing in", async ({ page }) => {
  // Deliberately public. The one document worth reading when sign-in is what
  // is broken, and it holds no reader's data.
  await page.goto("/help");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "使い方", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "EPUBとは何か" })).toBeVisible();
});

test("the header offers the manual from every screen", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "文章を選んでAIに聞く" })).toBeVisible();

  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
});
