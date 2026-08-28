import { expect, test } from "@playwright/test";

import { importDocument, login, MULTIPAGE_PDF, scrollReaderToEnd } from "./helpers";

test("PDF renders with navigation and selectable text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "navigation.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  await expect(reader.getByText("of 2")).toBeVisible({ timeout: 10_000 });
  await expect(reader.getByText("Structure of Scientific Revolutions")).toBeVisible({ timeout: 10_000 });

  // Every page is in the column; there is no page to swap to.
  await expect(reader.locator("[data-page-number]")).toHaveCount(2);
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("1");

  // Scrolling is the navigation, and the page number follows it.
  await scrollReaderToEnd(page);
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("2");
  await expect(reader.getByText("Normal science means research")).toBeVisible({ timeout: 10_000 });
});

test("the PDF text layer stays aligned with the rendered canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "alignment.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader.getByText("Structure of Scientific Revolutions")).toBeVisible({ timeout: 10_000 });

  // The selectable text is invisible: if its geometry drifts from the canvas,
  // nothing looks wrong in a DOM snapshot but every selection targets the wrong
  // glyphs. Compare the two boxes directly.
  const geometry = await reader.evaluate((section) => {
    const slot = section.querySelector('[data-page-number="1"]')!;
    const canvas = slot.querySelector("canvas");
    const layer = slot.querySelector(".textLayer");
    const span = slot.querySelector(".textLayer span");
    if (!canvas || !layer || !span) return null;
    const canvasBox = canvas.getBoundingClientRect();
    const layerBox = layer.getBoundingClientRect();
    const spanBox = span.getBoundingClientRect();
    const spanStyle = getComputedStyle(span);
    return {
      canvas: { width: canvasBox.width, height: canvasBox.height, x: canvasBox.x, y: canvasBox.y },
      layer: { width: layerBox.width, height: layerBox.height, x: layerBox.x, y: layerBox.y },
      span: {
        width: spanBox.width,
        height: spanBox.height,
        x: spanBox.x,
        y: spanBox.y,
        position: spanStyle.position,
        fontSize: Number.parseFloat(spanStyle.fontSize),
      },
    };
  });

  expect(geometry).not.toBeNull();
  const { canvas, layer, span } = geometry!;

  // The text layer must cover the canvas, not a differently scaled rectangle.
  expect(Math.abs(layer.width - canvas.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.height - canvas.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.x - canvas.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.y - canvas.y)).toBeLessThanOrEqual(2);

  // Without pdf.js's text layer stylesheet the runs are static inline text that
  // flows from the corner, which looks like a second copy of the page.
  expect(span.position).toBe("absolute");

  // The sample page starts its text about 10% in from the left and 6% down.
  // A run pinned to the corner means the layout never took the page geometry.
  expect(span.x - canvas.x).toBeGreaterThan(canvas.width * 0.05);
  expect(span.y - canvas.y).toBeGreaterThan(canvas.height * 0.02);
  expect(span.x).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(span.y).toBeLessThanOrEqual(canvas.y + canvas.height);

  // Font size has to follow the page scale, not fall back to the body default.
  expect(span.fontSize).toBeGreaterThan(14);
});

test("arrow keys turn pages and the zoom control resizes the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "keyboard.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader.getByText("of 2")).toBeVisible({ timeout: 10_000 });

  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await page.keyboard.press("ArrowRight");
  await expect(pageNumber).toHaveValue("2");
  await page.keyboard.press("ArrowLeft");
  await expect(pageNumber).toHaveValue("1");

  const widthAt = async () =>
    (await reader.locator('[data-page-number="1"] canvas').boundingBox())!.width;
  const fitWidth = await widthAt();

  const zoom = reader.getByRole("group", { name: "Page zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom.getByText("125%")).toBeVisible();
  await expect.poll(widthAt).toBeGreaterThan(fitWidth * 1.2);

  // Resetting returns to fit width, and the text layer must follow the canvas.
  await zoom.getByRole("button", { name: /Reset to fit width/ }).click();
  await expect(zoom.getByText("100%")).toBeVisible();
  await expect.poll(widthAt).toBeCloseTo(fitWidth, 0);

  const aligned = await reader.evaluate((section) => {
    const slot = section.querySelector('[data-page-number="1"]')!;
    const canvas = slot.querySelector("canvas")!.getBoundingClientRect();
    const layer = slot.querySelector(".textLayer")!.getBoundingClientRect();
    return Math.abs(canvas.width - layer.width) <= 2 && Math.abs(canvas.height - layer.height) <= 2;
  });
  expect(aligned).toBe(true);
});

test("typing a follow-up question never turns the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "typing.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader.getByText("of 2")).toBeVisible({ timeout: 10_000 });

  const question = page.getByLabel("Ask about this passage");
  await question.fill("Why does this matter");
  await question.press("ArrowLeft");
  await question.press("ArrowRight");

  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("1");
  await expect(question).toHaveValue("Why does this matter");
});

test("arrow keys do nothing at the first and last page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "bounds.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await expect(pageNumber).toHaveValue("1", { timeout: 10_000 });

  // Already at the start: nothing to go back to, and no redraw to pay for.
  const scrollTop = () => page.evaluate(
    () => document.querySelector("[data-reader-scroll]")!.scrollTop,
  );
  const before = await scrollTop();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  // Within a pixel: the claim is that nothing navigated, not that the offset is
  // bit-identical after a re-render.
  expect(Math.abs(await scrollTop() - before)).toBeLessThanOrEqual(2);
  await expect(pageNumber).toHaveValue("1");

  await scrollReaderToEnd(page);
  await expect(pageNumber).toHaveValue("2");
  const atEnd = await scrollTop();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  expect(Math.abs(await scrollTop() - atEnd)).toBeLessThanOrEqual(2);
  await expect(pageNumber).toHaveValue("2");
});
