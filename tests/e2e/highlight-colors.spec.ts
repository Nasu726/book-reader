import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login, MULTIPAGE_PDF } from "./helpers";

/** The text each registered colour is currently painting over. */
async function painted(page: import("@playwright/test").Page, color: string) {
  return page.evaluate((name) => {
    const registered = CSS.highlights.get(name);
    return registered ? [...registered].map((range) => range.toString()) : null;
  }, `book-reader-${color}`);
}

test("a highlight is chosen by colour and painted onto the passage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "painted.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/documents/${documentId}`);

  await expect(page.getByRole("region", { name: "PDF reader" })).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 10_000 },
  );

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll(".textLayer span"))
      .find((node) => node.textContent?.includes("A Role for History"));
    if (!target) throw new Error("PDF text node not found.");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  const menu = page.getByRole("group", { name: "Actions for the selected text" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Highlight in green" }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible();

  await expect.poll(() => painted(page, "green")).toEqual(["A Role for History"]);
  // A colour nobody chose must not be painting anything.
  expect(await painted(page, "pink")).toBe(null);
});

test("a saved highlight is painted again when the document is reopened", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "repainted.pdf", MULTIPAGE_PDF, "application/pdf");

  const created = await page.request.post(`/api/documents/${documentId}/highlights`, {
    data: {
      color: "blue",
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "A Role for History",
    },
  });
  expect(created.status()).toBe(201);

  await page.goto(`/documents/${documentId}`);
  await expect.poll(() => painted(page, "blue"), { timeout: 15_000 })
    .toEqual(["A Role for History"]);
});

test("a colour the reader could not have chosen is refused", async ({ page }) => {
  await login(page);
  const documentId = await importDocument(page, "bad-colour.pdf", MULTIPAGE_PDF, "application/pdf");

  const refused = await page.request.post(`/api/documents/${documentId}/highlights`, {
    data: {
      color: "chartreuse",
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "A Role for History",
    },
  });
  expect(refused.status()).toBe(400);

  // And an omitted colour is simply the default, not an error.
  const accepted = await page.request.post(`/api/documents/${documentId}/highlights`, {
    data: {
      format: "pdf",
      location: JSON.stringify({ page: 1, source: "text-layer-viewport", version: 1 }),
      selectedText: "A Role for History",
    },
  });
  expect(accepted.status()).toBe(201);
  expect(((await accepted.json()) as { highlight: { color: string } }).highlight.color).toBe("yellow");
});

test("an EPUB highlight is placed by the offsets it was captured with", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(page, "painted.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("region", { name: "EPUB reader" });
  await expect(reader.getByText("Alpha journey text.")).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll("article p"))
      .find((node) => node.textContent?.includes("Alpha journey text."));
    if (!paragraph) throw new Error("EPUB paragraph not found.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: "Highlight in pink" }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible();
  await expect.poll(() => painted(page, "pink")).toEqual(["Alpha journey text."]);

  // Reopened, the paint comes from the stored offsets rather than from the
  // selection that is no longer there.
  await page.reload();
  await expect.poll(() => painted(page, "pink"), { timeout: 15_000 })
    .toEqual(["Alpha journey text."]);
});

test("the highlight rules survive the CSS pipeline", async ({ page }) => {
  await login(page);

  // Next's CSS validator warns that `::highlight()` is not a pseudo-element it
  // recognises, and passes it through anyway. If a toolchain upgrade ever turns
  // that warning into a removal, every highlight would still register and
  // nothing would be drawn — silently. This is the check that would notice.
  const rules = await page.evaluate(() => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue; // A cross-origin stylesheet cannot be read, and holds none of ours.
      }
      for (const rule of Array.from(cssRules)) {
        if (rule.cssText.includes("::highlight(book-reader-")) found.push(rule.cssText);
      }
    }
    return found;
  });

  expect(rules).toHaveLength(4);
  expect(rules.join(" ")).toContain("background-color");
});
