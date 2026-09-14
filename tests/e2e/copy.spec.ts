import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, MULTIPAGE_PDF } from "./helpers";

/**
 * Copying is how a passage reaches the tools that answer questions about it
 * (D-52), so what lands on the clipboard has to be prose, not the lines of
 * the page, and can carry where it came from.
 */

/** Selects from the start of one text-layer line to the end of another. */
async function selectLines(page: import("@playwright/test").Page, first: string, last: string) {
  await page.evaluate(([from, to]) => {
    const spans = Array.from(document.querySelectorAll(".textLayer span"));
    const start = spans.find((node) => node.textContent?.includes(from));
    const end = spans.find((node) => node.textContent?.includes(to));
    if (!start?.firstChild || !end?.firstChild) throw new Error("PDF text nodes not found.");
    const range = document.createRange();
    range.setStart(start.firstChild, 0);
    range.setEnd(end.firstChild, end.textContent!.length);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    end.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, [first, last]);
}

const clipboard = (page: import("@playwright/test").Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test("a PDF passage is copied as prose, with or without its source", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "clip.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );

  // Two lines of the page. The text layer hands them over with a line break
  // between; pasted anywhere, that break is a broken sentence.
  await selectLines(page, "Chapter 1: Introduction", "A Role for History");
  const menu = page.getByRole("group", { name: "Actions for the selected text" });
  await menu.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => clipboard(page)).toBe("Chapter 1: Introduction A Role for History");
  await expect(menu.getByRole("button", { name: "Copy", exact: true })).toHaveText("Copied");

  await menu.getByRole("button", { name: "Copy with source" }).click();
  await expect.poll(() => clipboard(page))
    .toBe("Chapter 1: Introduction A Role for History\n\n— clip, p.1");
});

test("an EPUB passage names its chapter when copied with its source", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "clip.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/read/${documentId}`);
  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll("article p"))
      .find((node) => node.textContent?.includes("Alpha journey text."));
    const range = document.createRange();
    range.selectNodeContents(paragraph!.firstChild!);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    paragraph!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Copy with source" }).click();
  await expect.poll(() => clipboard(page))
    .toBe("Alpha journey text.\n\n— Notes on Thinking Machines, §1. The Analytical Engine");
});

test("the text view copies a whole paragraph in one tap", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "paragraph.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await page.getByRole("group", { name: "Reading view" }).getByRole("button", { name: "Text" }).click();

  const reader = page.getByRole("region", { name: "PDF reader" });
  const first = reader.locator("article p").first();
  await expect(first).toContainText("Structure of Scientific Revolutions", { timeout: 15_000 });
  const expected = (await first.innerText()).trim();

  const copy = first.getByRole("button", { name: "Copy paragraph" });
  // Thumb-sized, whatever it looks like.
  const box = (await copy.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await copy.click();
  await expect.poll(() => clipboard(page)).toBe(expected);
});
