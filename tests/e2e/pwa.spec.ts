import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";

test("app exposes installable PWA metadata and icons", async ({ page }) => {
  await page.goto("/login");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  assert.equal(manifestHref, "/manifest.webmanifest");
  const themeColor = await page.locator('meta[name="theme-color"]').getAttribute("content");
  expect(themeColor).toBeTruthy();

  const response = await page.request.get(manifestHref!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as {
    display: string;
    icons: { sizes: string; src: string; type: string }[];
    start_url: string;
  };

  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]),
  );

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
});
