import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login, MULTIPAGE_PDF } from "./helpers";

/**
 * Mobile layout regression, run under the `mobile-layout` project: Chromium
 * with a phone viewport, touch input, and a mobile device pixel ratio.
 *
 * This guards layout only. iOS puts every browser on WKWebView, so Safari and
 * iOS Chrome behaviour — the native selection handles, dvh against the
 * collapsing toolbar, keyboard insets — is not exercised here. That stays
 * HUMAN-001. Desktop is the priority target; these tests exist so desktop work
 * cannot quietly break the phone layout in the meantime.
 */

test("the reader stays the primary pane and never scrolls sideways", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(
    page,
    "mobile.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  // The AI pane must not take space from the text on a narrow screen.
  await expect(page.getByRole("complementary", { name: "AI and notes" })).toBeHidden();

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("a PDF page fits the phone width without horizontal scrolling", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "mobile.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader.getByText("Structure of Scientific Revolutions")).toBeVisible({ timeout: 10_000 });

  const fits = await reader.evaluate((section) => {
    const canvas = section.querySelector('[data-page-number="1"] canvas');
    const area = canvas?.parentElement;
    if (!canvas || !area) return null;
    return {
      canvasWidth: canvas.getBoundingClientRect().width,
      areaWidth: area.clientWidth,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(fits).not.toBeNull();
  expect(fits!.canvasWidth).toBeLessThanOrEqual(fits!.areaWidth + 1);
  expect(fits!.pageOverflows).toBe(false);
});

test("the AI drawer opens over the reader and returns to it", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(
    page,
    "mobile-drawer.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Ask AI", exact: true }).tap();
  const drawer = page.getByRole("dialog", { name: "AI drawer" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Follow-up question")).toBeVisible();

  await drawer.getByRole("button", { name: "Close", exact: true }).tap();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible();
});

test("every control is large enough to tap", async ({ page }) => {
  await login(page);

  // 44px is the smallest comfortable touch target; the reader controls and the
  // import form are the first thing a phone user meets. Polled, because the
  // dev server injects the stylesheet after the document is interactive and
  // unstyled elements are all too small.
  await expect.poll(async () => page.evaluate(() => {
    const tooSmall: string[] = [];
    for (const element of document.querySelectorAll("button, a[href], select")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.height < 40) {
        tooSmall.push(`${element.tagName}: ${(element.textContent ?? "").trim().slice(0, 30)}`);
      }
    }
    return tooSmall;
  }), { timeout: 15_000 }).toEqual([]);
});
