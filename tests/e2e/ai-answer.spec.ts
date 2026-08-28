import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login } from "./helpers";

async function openEpub(page: import("@playwright/test").Page) {
  await login(page);
  const documentId = await importDocument(
    page,
    "ai-answer.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible({ timeout: 10_000 });
}

test("AI actions render in the desktop secondary pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEpub(page);

  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  await expect(secondary).toBeVisible();
  const actions = secondary.getByRole("group", { name: "AI actions" });
  await expect(actions).toBeVisible();
  // Highlighting is not among them: it happens against the selection, where a
  // colour can be chosen, rather than as a colourless button in this pane.
  for (const action of ["Explain", "Translate", "Simplify", "Ask"]) {
    const button = actions.getByRole("button", { name: action, exact: true });
    await expect(button).toBeVisible();
    // Offered, but not usable until there is a passage to act on.
    await expect(button).toBeDisabled();
  }
  await expect(actions.getByRole("button", { name: "Highlight", exact: true })).toHaveCount(0);
});

test("the AI panel exists exactly once, so its labels stay wired to its own inputs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEpub(page);
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();

  // Duplicated ids silently break every label association on the page.
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const element of document.querySelectorAll("[id]")) {
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    }
    return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicates).toEqual([]);
});

test("desktop panes scroll independently", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await openEpub(page);

  const reader = page.getByRole("main", { name: "Reader" });
  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  await expect(reader).toBeVisible();
  await expect(secondary).toBeVisible();

  // Both panes must own their scrolling, so a long AI answer never pushes the
  // book text off screen.
  for (const pane of [reader, secondary]) {
    expect(
      await pane.evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe("auto");
  }

  const boxes = await Promise.all([reader.boundingBox(), secondary.boundingBox()]);
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).not.toBeNull();
  expect(Math.abs((boxes[0]!.y ?? 0) - (boxes[1]!.y ?? 0))).toBeLessThan(2);
});

test("mobile drawer preserves a scrollable AI response and returns to the Reader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEpub(page);

  // The secondary pane is hidden on narrow viewports; the drawer is the only
  // way to reach the AI actions without losing the reading position.
  await expect(page.getByRole("complementary", { name: "AI and notes" })).toBeHidden();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "AI drawer" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Follow-up question")).toBeVisible();
  await expect(
    drawer.getByRole("group", { name: "AI actions" }).getByRole("button", { name: "Explain" }),
  ).toBeVisible();
  // The sheet stops short of the top so the passage stays in view behind it.
  const box = await drawer.boundingBox();
  expect(box!.y).toBeGreaterThan(80);

  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask AI", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "EPUB reader" })).toBeVisible();
});
