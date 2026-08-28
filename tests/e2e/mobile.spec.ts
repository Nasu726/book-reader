import { expect, test } from "@playwright/test";

import { buildEpub, buildPdf, importDocument, login, MULTIPAGE_PDF, scrollReaderToEnd, swipeSheetDown } from "./helpers";

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
  await expect(drawer.getByLabel("Ask about this passage")).toBeVisible();

  await swipeSheetDown(page);
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

test("a long PDF gives back the pages it has scrolled past", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const documentId = await importDocument(page, "long.pdf", buildPdf(12), "application/pdf");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );

  const canvasPixels = async (pageNumber: number) => page.evaluate((wanted) => {
    const canvas = document.querySelector(`[data-page-number="${wanted}"] canvas`) as HTMLCanvasElement | null;
    return canvas ? canvas.width * canvas.height : -1;
  }, pageNumber);

  expect(await canvasPixels(1)).toBeGreaterThan(0);

  await scrollReaderToEnd(page);
  // At three device pixels to one, a phone-width page is about eight megabytes
  // of canvas. Holding every page ever scrolled past is what makes iOS Safari
  // stop drawing them, and no amount of pressing Try again brings it back.
  await expect.poll(() => canvasPixels(1), { timeout: 15_000 }).toBe(0);
  // The pages actually being read are still drawn.
  await expect.poll(() => canvasPixels(12), { timeout: 15_000 }).toBeGreaterThan(0);
});

test("a small tug on the sheet does not throw it away", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(
    page,
    "sheet-tug.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Ask AI", exact: true }).tap();

  const drawer = page.getByRole("dialog", { name: "AI drawer" });
  await expect(drawer).toBeVisible();

  // Slowly, and not far. Anything that can be dismissed by accident is worse
  // than something that has to be dismissed on purpose.
  const grip = drawer.locator("div").first();
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const step of [10, 20, 30]) {
    await page.mouse.move(x, y + step);
    await page.waitForTimeout(80);
  }
  await page.mouse.up();

  await expect(drawer).toBeVisible();
});
