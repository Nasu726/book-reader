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

test("nothing you type into is small enough to make iOS zoom", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(
    page,
    "typing.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Ask AI", exact: true }).tap();
  await page.getByRole("tab", { name: "Notes" }).tap();

  // Below 16px, Safari magnifies the page on focus and never zooms back out.
  // Polled, because the development server styles the document after it is
  // interactive and an unstyled field reports the browser default.
  await expect.poll(async () => page.evaluate(() => {
    const small: string[] = [];
    for (const field of document.querySelectorAll("input, textarea, select")) {
      const size = Number.parseFloat(getComputedStyle(field).fontSize);
      const hidden = field.getBoundingClientRect().height === 0;
      if (!hidden && size < 16) small.push(`${field.tagName}#${field.id || "?"} ${size}px`);
    }
    return small;
  }), { timeout: 10_000 }).toEqual([]);
});

test("zooming grows the page from the middle and can be scrolled to either edge", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const documentId = await importDocument(page, "zoom.pdf", buildPdf(4), "application/pdf");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );

  const pane = () => page.evaluate(() => {
    const scroller = document.querySelector("[data-reader-scroll]") as HTMLElement;
    const first = document.querySelector('[data-page-number="1"]') as HTMLElement;
    return {
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      scrollLeft: scroller.scrollLeft,
      pageWidth: first.getBoundingClientRect().width,
      pageLeft: first.getBoundingClientRect().left,
    };
  });

  // At 100% a page fits, and nothing scrolls sideways.
  const fitted = await pane();
  expect(fitted.scrollWidth).toBeLessThanOrEqual(fitted.clientWidth + 1);

  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: "Zoom in" }).tap();
  }
  await expect(page.getByRole("group", { name: "Page zoom" })).toContainText("200%");

  const zoomed = await pane();
  expect(zoomed.pageWidth).toBeGreaterThan(fitted.pageWidth * 1.8);
  // Grown from the middle, not from the left corner: the text of a page runs
  // down its centre, and anchoring at the left put the reader in the margin.
  expect(zoomed.scrollLeft).toBeGreaterThan(0);
  const centred = (zoomed.scrollWidth - zoomed.clientWidth) / 2;
  expect(Math.abs(zoomed.scrollLeft - centred)).toBeLessThan(4);

  // Both edges are reachable. Centring a flex item with align-items instead of
  // auto margins leaves the overflowing side unscrollable.
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-reader-scroll]") as HTMLElement;
    scroller.scrollLeft = 0;
  });
  expect((await pane()).pageLeft).toBeGreaterThanOrEqual(-1);
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-reader-scroll]") as HTMLElement;
    scroller.scrollLeft = scroller.scrollWidth;
  });
  const atRight = await pane();
  expect(atRight.pageLeft + atRight.pageWidth).toBeLessThanOrEqual(atRight.clientWidth + 1);
});

test("the page count follows the page under the middle of the pane, zoomed or not", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const documentId = await importDocument(page, "zoom-count.pdf", buildPdf(6), "application/pdf");
  await page.goto(`/documents/${documentId}`);
  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await expect(pageNumber).toHaveValue("1", { timeout: 15_000 });

  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: "Zoom in" }).tap();
  }

  // A zoomed page shows a much smaller fraction of itself, which is what used
  // to leave the count reading a page that had long since scrolled away.
  await scrollReaderToEnd(page);
  await expect.poll(async () => pageNumber.inputValue(), { timeout: 15_000 }).toBe("6");

  await page.evaluate(() => {
    const scroller = document.querySelector("[data-reader-scroll]") as HTMLElement;
    scroller.scrollTop = 0;
  });
  await expect.poll(async () => pageNumber.inputValue(), { timeout: 15_000 }).toBe("1");
});
