import { expect, test } from "@playwright/test";

test("the manual is a screen of its own, with a real address", async ({ page }) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "使い方", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "EPUBとは何か" })).toBeVisible();
});

test("the header offers the manual from every screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "文章を選んで、コピーするか印を付ける" })).toBeVisible();

  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
});

test("the manual can be looked things up in", async ({ page }) => {
  await page.goto("/help");

  const contents = page.getByRole("navigation", { name: "Contents" });
  const links = contents.getByRole("link");
  await expect(links).toHaveCount(8);

  // Every entry has somewhere to go. A table of contents that points at a
  // heading someone renamed is worse than none.
  const missing = await page.evaluate(() => {
    const broken: string[] = [];
    for (const link of document.querySelectorAll('[aria-label="Contents"] a')) {
      const target = (link as HTMLAnchorElement).hash.slice(1);
      if (!document.getElementById(target)) broken.push(target);
    }
    return broken;
  });
  expect(missing).toEqual([]);

  await contents.getByRole("link", { name: "EPUBとは何か" }).click();
  await expect(page).toHaveURL(/#epub$/);
  await expect(page.getByRole("heading", { name: "EPUBとは何か" })).toBeInViewport();

  await page.getByRole("link", { name: "↑ Top" }).click();
  await expect(page).toHaveURL(/#top$/);
  await expect(page.getByRole("heading", { name: "使い方", exact: true })).toBeInViewport();
});
