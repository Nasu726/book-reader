import { expect, test } from "@playwright/test";

import { buildPdf, buildTaggedPdf, importDocument, login, MULTIPAGE_PDF, scrollReaderToEnd } from "./helpers";

/**
 * The reader's controls, which sit above the pane rather than inside it.
 *
 * A toolbar inside the scrolling pane is pinned vertically and nothing else, so
 * zooming a page past the width of the screen slid the page number off to the
 * left along with the book.
 */
function controls(page: import("@playwright/test").Page) {
  return page.getByRole("group", { name: "PDF controls" });
}

test("PDF renders with navigation and selectable text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "navigation.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 10_000 });
  await expect(controls(page).getByText("of 2")).toBeVisible({ timeout: 10_000 });
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
  await expect(controls(page).getByText("of 2")).toBeVisible({ timeout: 10_000 });

  const pageNumber = page.getByRole("spinbutton", { name: "Page number" });
  await page.keyboard.press("ArrowRight");
  await expect(pageNumber).toHaveValue("2");
  await page.keyboard.press("ArrowLeft");
  await expect(pageNumber).toHaveValue("1");

  const widthAt = async () =>
    (await reader.locator('[data-page-number="1"] canvas').boundingBox())!.width;
  const fitWidth = await widthAt();

  const zoom = controls(page).getByRole("group", { name: "Page zoom" });
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

  await expect(controls(page).getByText("of 2")).toBeVisible({ timeout: 10_000 });

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

test("a large PDF is fetched in pieces rather than all at once", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const file = buildPdf(60, 4_000);
  expect(file.byteLength).toBeGreaterThan(200_000);
  const documentId = await importDocument(page, "ranged.pdf", file, "application/pdf");

  const statuses: number[] = [];
  let rangedBytes = 0;
  page.on("response", (response) => {
    if (!response.url().includes(`/documents/${documentId}/source`)) return;
    statuses.push(response.status());
    // Only the ranges. The viewer opens one full request to learn the length
    // and abandons it, so counting what that one declared would count bytes
    // that never crossed the wire.
    if (response.status() === 206) {
      rangedBytes += Number(response.headers()["content-length"] ?? 0);
    }
  });

  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );

  // Answered as ranges, and only the part the first pages need. Handing the
  // viewer the whole file is what made a phone reload the tab before it could
  // draw anything.
  expect(statuses).toContain(206);
  expect(rangedBytes).toBeGreaterThan(0);
  expect(rangedBytes).toBeLessThan(file.byteLength / 2);
});

test("a PDF can be read as text as well as as pages", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "as-text.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "PDF reader" });
  await expect(reader).toBeVisible({ timeout: 15_000 });
  // The page at the top of the pane is the page you are on, however short it
  // is. Counting the page under the middle reads the next one down as soon as
  // a page is shorter than the screen, which in the text view is most of them.
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("1");
  // Pages first: what a PDF is, until someone asks for something else.
  await expect(reader.locator("canvas")).not.toHaveCount(0);
  await expect(page.getByRole("group", { name: "Page zoom" })).toBeVisible();

  await controls(page).getByRole("button", { name: "Text" }).click();

  // Real prose in the document, not spans laid over a picture of a page.
  const firstPage = reader.locator('[data-page-number="1"]');
  await expect(firstPage.locator("p").first())
    .toHaveText("The Structure of Scientific Revolutions", { timeout: 15_000 });
  await expect(reader.locator("canvas")).toHaveCount(0);
  await expect(reader.locator(".textLayer")).toHaveCount(0);
  // The paragraph that runs across four printed lines is one paragraph.
  await expect(firstPage.locator("p").nth(3))
    .toContainText("could produce a decisive transformation");

  await expect(reader.locator('[data-page-number="2"] p').first())
    .toBeVisible({ timeout: 15_000 });

  // Page one is short enough that everything below the middle of the screen is
  // already page two, and the reader is still on page one: it is what they are
  // looking at. Counting from the middle reads two here.
  await expect(page.getByRole("spinbutton", { name: "Page number" })).toHaveValue("1");

  // Zoom belongs to the printed page; reflowed text is resized instead.
  await expect(page.getByRole("group", { name: "Page zoom" })).toBeHidden();
  await expect(page.getByRole("group", { name: "Text size" })).toBeVisible();

  // And the choice is remembered, or nobody would use the second way twice.
  await page.reload();
  await expect(reader.locator('[data-page-number="1"] p').first())
    .toHaveText("The Structure of Scientific Revolutions", { timeout: 15_000 });
});

test("a passage selected in the text view is highlighted in both views", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "text-marks.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await controls(page).getByRole("button", { name: "Text" }).click();
  await expect(page.locator('[data-page-number="1"] p').first())
    .toHaveText("The Structure of Scientific Revolutions", { timeout: 15_000 });

  await page.evaluate(() => {
    const paragraph = document.querySelector('[data-page-number="1"] p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph.firstChild!);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Highlight in green" }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible({ timeout: 15_000 });

  // Filed under the page it is on. It used to be filed under whichever page
  // was in front of the reader, which in the text view is the next one down as
  // soon as a page is short enough to leave the middle of the pane past it.
  const saved = await page.request.get(`/api/documents/${documentId}/highlights`);
  const { highlights } = (await saved.json()) as { highlights: { location: string }[] };
  expect(JSON.parse(highlights[0].location).page).toBe(1);

  const painted = () => page.evaluate(() => {
    const registered = CSS.highlights.get("book-reader-green");
    return registered ? [...registered].map((range) => range.toString()) : null;
  });
  await expect.poll(painted).toEqual(["The Structure of Scientific Revolutions"]);

  // The mark is on the passage, not on the way it happened to be shown.
  await controls(page).getByRole("button", { name: "Pages" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );
  await expect.poll(painted, { timeout: 15_000 })
    .toEqual(["The Structure of Scientific Revolutions"]);
});

test("the page number keeps up in the text view", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(
    page,
    "text-count.pdf",
    buildPdf(8, 0, 12),
    "application/pdf",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await controls(page).getByRole("button", { name: "Text" }).click();
  await expect(page.locator('[data-page-number="1"] p').first()).toBeVisible({ timeout: 15_000 });

  // Switching views replaces every page element. The observer watching them has
  // to be pointed at the new ones, or it goes on watching what React threw away
  // and the number sits wherever it happened to stand.
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-reader-scroll]") as HTMLElement;
    const fifth = document.querySelector('[data-page-number="5"]') as HTMLElement;
    scroller.scrollTop += fifth.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  });
  await expect.poll(
    async () => page.getByRole("spinbutton", { name: "Page number" }).inputValue(),
    { timeout: 15_000 },
  ).toBe("5");
});

test("the view switch does not move when the zoom control leaves with it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "switch.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });

  const toggle = controls(page).getByRole("button", { name: "Text" });
  const before = await toggle.boundingBox();

  await toggle.click();
  await expect(page.getByRole("group", { name: "Page zoom" })).toBeHidden();

  // Zoom belongs to the printed page and leaves with it. A control that moves
  // out from under the pointer when its neighbour goes is a control you have to
  // find again to undo what you just did.
  const after = await controls(page).getByRole("button", { name: "Text" }).boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
});

test("a tagged PDF is read as the paragraphs it says it has", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(
    page,
    "tagged.pdf",
    // Every line the same width, evenly spaced, no indents: the layout says
    // nothing about where the paragraph ends and the structure says everything.
    buildTaggedPdf([
      [
        "History, if viewed as a repository for more than a",
        "anecdote or chronology, could produce a decisive b",
        "transformation in the image of science by which cc",
      ],
      ["Normal science means research firmly based upon one"],
    ]),
    "application/pdf",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 15_000 });
  await controls(page).getByRole("button", { name: "Text" }).click();

  // Three lines on the page, one paragraph in the document. Where a PDF is
  // tagged it already knows this; reading it off the geometry is guesswork.
  const paragraphs = page.locator('[data-page-number="1"] p');
  await expect(paragraphs).toHaveCount(2, { timeout: 15_000 });
  await expect(paragraphs.first()).toHaveText(
    "History, if viewed as a repository for more than a anecdote or chronology,"
    + " could produce a decisive b transformation in the image of science by which cc",
  );
  await expect(paragraphs.nth(1)).toHaveText(
    "Normal science means research firmly based upon one",
  );
});
