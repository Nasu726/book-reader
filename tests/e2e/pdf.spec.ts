import { expect, test } from "@playwright/test";

import { importDocument, login, MULTIPAGE_PDF } from "./helpers";

test("PDF renders with navigation and selectable text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "navigation.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  await expect(reader.getByText("Page 1 / 2")).toBeVisible({ timeout: 10_000 });
  await expect(reader.locator("canvas")).toBeVisible();
  await expect(reader.getByText("Structure of Scientific Revolutions")).toBeVisible({ timeout: 10_000 });
  await expect(reader.getByRole("button", { name: "Previous" })).toBeDisabled();

  await reader.getByRole("button", { name: "Next" }).click();
  await expect(reader.getByText("Page 2 / 2")).toBeVisible();
  await expect(reader.getByText("Normal science means research")).toBeVisible({ timeout: 10_000 });
  await expect(reader.getByRole("button", { name: "Next" })).toBeDisabled();
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
    const canvas = section.querySelector("canvas");
    const layer = section.querySelector(".textLayer");
    const span = section.querySelector(".textLayer span");
    if (!canvas || !layer || !span) return null;
    const canvasBox = canvas.getBoundingClientRect();
    const layerBox = layer.getBoundingClientRect();
    const spanBox = span.getBoundingClientRect();
    return {
      canvas: { width: canvasBox.width, height: canvasBox.height, x: canvasBox.x, y: canvasBox.y },
      layer: { width: layerBox.width, height: layerBox.height, x: layerBox.x, y: layerBox.y },
      span: { width: spanBox.width, x: spanBox.x, y: spanBox.y },
    };
  });

  expect(geometry).not.toBeNull();
  const { canvas, layer, span } = geometry!;

  // The text layer must cover the canvas, not a differently scaled rectangle.
  expect(Math.abs(layer.width - canvas.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.height - canvas.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.x - canvas.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(layer.y - canvas.y)).toBeLessThanOrEqual(2);

  // A text run has to sit inside the page, and be wide enough to have been
  // laid out at the page's scale rather than at an unscaled 1.0 viewport.
  expect(span.x).toBeGreaterThanOrEqual(canvas.x - 2);
  expect(span.y).toBeGreaterThanOrEqual(canvas.y - 2);
  expect(span.x).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(span.width).toBeGreaterThan(canvas.width * 0.2);
});
