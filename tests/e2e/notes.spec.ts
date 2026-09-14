import { expect, test } from "@playwright/test";

import { importDocument, MULTIPAGE_PDF } from "./helpers";

/** Selects the title line on page 1 and marks it yellow. */
async function markTheTitle(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll(".textLayer span"))
      .find((node) => node.textContent?.includes("Structure of Scientific Revolutions"));
    if (!target) throw new Error("PDF text node not found.");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Highlight in yellow" }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible();
}

test("a mark takes a note, and the note is where the vocabulary went", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "noted-marks.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await markTheTitle(page);

  const marks = page.getByRole("region", { name: "Saved highlights" });
  await marks.getByRole("button", { name: /^Add note:/ }).click();
  await page.getByRole("textbox", { name: "Note on this highlight" }).fill("Kuhn's 1962 book. Paradigm = shared exemplar.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(marks).toContainText("Paradigm = shared exemplar.");
  // Filed under the page, for a person.
  await expect(marks).toContainText("p.1");

  await page.reload();
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 10_000 });
  await expect(marks).toContainText("Paradigm = shared exemplar.");
  await expect(marks.getByRole("button", { name: /^Edit note:/ })).toBeVisible();
});

test("the note is rendered in the vault's shape", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "shaped.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await markTheTitle(page);
  await page.getByRole("region", { name: "Saved highlights" }).getByRole("button", { name: /^Add note:/ }).click();
  await page.getByRole("textbox", { name: "Note on this highlight" }).fill("The title.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: "Document note" }).fill("Read for the seminar.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Finished reading" }).check();

  await page.getByRole("button", { name: "Copy note as Markdown" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toBe(`---
title: shaped
added: ${new Date().toISOString().slice(0, 10)}
status: done
tags: [book-reader]
---
<!-- book-reader:start -->
> [!quote] p.1 · yellow
> The Structure of Scientific Revolutions
>
> The title.
<!-- h: ${markdown.match(/<!-- h: (\S+) /)?.[1]} pdf:1 -->

## Memo
Read for the seminar.
<!-- book-reader:end -->
`);

  // The finished flag is kept, like everything else.
  await page.reload();
  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("checkbox", { name: "Finished reading" })).toBeChecked();
});
