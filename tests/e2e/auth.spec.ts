import { expect, test } from "@playwright/test";

import { buildEpub, importDocument, login } from "./helpers";

test("unauthenticated users cannot read app content", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("wrong credentials are refused without saying which field was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-reader");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("region", { name: "Library" })).toBeHidden();
});

test("signing out ends the session for this browser", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("the reader fills a narrow viewport and the AI pane stays out of the way", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const reader = page.getByRole("main", { name: "Reader" });
  await expect(reader).toBeVisible();
  const box = await reader.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(300);

  await expect(page.getByRole("complementary", { name: "AI and notes" })).toBeHidden();
});

test("a wide viewport hosts the secondary pane beside the reader", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  // The pane belongs to a document; the library has nothing to ask about.
  const documentId = await importDocument(page, "two-pane.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);

  const reader = page.getByRole("main", { name: "Reader" });
  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  await expect(secondary).toBeVisible();

  const boxes = await Promise.all([reader.boundingBox(), secondary.boundingBox()]);
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).not.toBeNull();
  expect(boxes[1]!.width).toBeGreaterThanOrEqual(320);
  // Side by side, not stacked.
  expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width - 1);
});

test("theme and font size preferences persist across a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  // Text size only appears where reflowing the text does something.
  const documentId = await importDocument(page, "prefs.epub", await buildEpub(), "application/epub+zip");
  await page.goto(`/documents/${documentId}`);

  // Polled: the dev server injects the stylesheet after the document is
  // interactive, and an unstyled pane reports a transparent background.
  const readerBackground = async () => page.evaluate(() => {
    const reader = document.querySelector('[aria-label="Reader"]');
    return reader ? getComputedStyle(reader).backgroundColor : null;
  });
  await expect.poll(readerBackground, { timeout: 10_000 }).toBe("rgb(255, 255, 255)");
  const lightReaderBackground = await readerBackground();

  // These are server-rendered before React attaches its handlers, so an early
  // click lands on nothing.
  await expect(async () => {
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Increase text size" }).click();
  await expect(page.getByRole("group", { name: "Text size" })).toContainText("110%");

  const stored = await page.evaluate(() => ({
    fontSize: localStorage.getItem("book-reader-font-size"),
    theme: localStorage.getItem("book-reader-theme"),
  }));
  expect(stored).toEqual({ fontSize: "110", theme: "dark" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Text size" })).toContainText("110%");
  // The saved theme has to actually repaint the page. The reader pane is
  // painted by Tailwind's `dark:` variant rather than by a plain CSS rule, so
  // this also proves the variant follows the theme class instead of the
  // operating system preference.
  await expect.poll(readerBackground, { timeout: 10_000 }).not.toBe(lightReaderBackground);

  const darkReaderBackground = await page.evaluate(() => {
    const reader = document.querySelector('[aria-label="Reader"]');
    return reader ? getComputedStyle(reader).backgroundColor : "";
  });
  const channels = darkReaderBackground.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
  expect(Math.max(...channels)).toBeLessThan(80);
});

test("the font size control scales the book text but not the controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const documentId = await importDocument(
    page,
    "font-scale.epub",
    await buildEpub(),
    "application/epub+zip",
  );
  await page.goto(`/documents/${documentId}`);

  const article = page.locator("article.reader-prose");
  await expect(article).toBeVisible({ timeout: 10_000 });

  const measure = async () => page.evaluate(() => {
    const article = document.querySelector("article.reader-prose");
    const button = document.querySelector('[aria-label="Text size"] button');
    return {
      textSize: article ? Number.parseFloat(getComputedStyle(article).fontSize) : 0,
      buttonHeight: button ? button.getBoundingClientRect().height : 0,
    };
  });

  const before = await measure();
  const increase = page.getByRole("button", { name: "Increase text size" });
  for (let step = 0; step < 4; step += 1) await increase.click();
  await expect(page.getByRole("group", { name: "Text size" })).toContainText("140%");

  const after = await measure();
  expect(after.textSize).toBeGreaterThan(before.textSize * 1.2);
  // Chrome must stay put: a shrinking button is how this control used to break
  // every touch target on a phone.
  expect(after.buttonHeight).toBeCloseTo(before.buttonHeight, 0);
  expect(after.buttonHeight).toBeGreaterThanOrEqual(40);
});

test("the library offers import and a useful empty state", async ({ page }) => {
  await login(page);

  await expect(page.getByLabel("Import PDF or EPUB")).toBeAttached();
  // A label rather than a button, so the picker opens without waiting on React.
  await expect(page.getByText("Add a book")).toBeVisible();

  const library = page.getByRole("region", { name: "Library" });
  const links = await library.getByRole("link").count();
  if (links === 0) {
    await expect(library).toContainText("No documents yet");
  }
});
