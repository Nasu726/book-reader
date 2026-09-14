import { expect, test } from "@playwright/test";

import { importDocument, MULTIPAGE_PDF } from "./helpers";

/**
 * The vault, through the same Worker code that runs in production, against
 * the memory store. `page.request` plays the other device: what it writes to
 * `/api/vault/notes/*` is what another phone would have synced.
 */

async function markLine(page: import("@playwright/test").Page, text: string, color = "yellow") {
  await page.waitForFunction(
    () => document.querySelectorAll(".textLayer span").length > 0,
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate((wanted) => {
    const target = Array.from(document.querySelectorAll(".textLayer span"))
      .find((node) => node.textContent?.includes(wanted));
    if (!target) throw new Error(`PDF text "${wanted}" not found.`);
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, text);
  await page.getByRole("group", { name: "Actions for the selected text" })
    .getByRole("button", { name: `Highlight in ${color}` }).click();
  await expect(page.getByText("Highlight saved.")).toBeVisible();
}

/** Presses Sync now and waits for that run — not an earlier one — to finish. */
async function syncNow(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Notes" }).click();
  const status = page.locator("[data-sync-state]");
  const before = Number(await status.getAttribute("data-sync-run"));
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(async () => Number(await status.getAttribute("data-sync-run")), { timeout: 15_000 })
    .toBeGreaterThan(before);
  await expect(status).toHaveAttribute("data-sync-state", "synced");
}

const noteName = (title: string, id: string) => `${title} (${id.slice(0, 8)}).md`;
const noteUrl = (name: string) => `/api/vault/notes/${encodeURIComponent(name)}`;

test("a mark made here reaches the vault as the note's block", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "vault-mark.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await markLine(page, "A Role for History", "green");
  await syncNow(page);

  const stored = await page.request.get(noteUrl(noteName("vault-mark", documentId)));
  expect(stored.status()).toBe(200);
  const { text } = (await stored.json()) as { text: string };
  expect(text).toContain("title: vault-mark");
  expect(text).toContain("> [!quote] p.1 · green\n> A Role for History");
  expect(text).toMatch(/<!-- h: \S+ pdf:1 -->/);
});

test("a mark from another device is kept, and one deleted here stays deleted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "vault-merge.pdf", MULTIPAGE_PDF, "application/pdf");
  const name = noteName("vault-merge", documentId);

  // The other device marked two lines and wrote its own text below.
  const planted = await page.request.put(noteUrl(name), {
    data: {
      message: "the other device",
      text: `---
title: vault-merge
added: 2026-09-14
status: reading
tags: [book-reader]
---
<!-- book-reader:start -->
> [!quote] p.1 · blue
> Chapter 1: Introduction
<!-- h: theirs1 pdf:1 -->

> [!quote] p.1 · pink
> A Role for History
<!-- h: theirs2 pdf:1 -->
<!-- book-reader:end -->

## My reading

Links to [[Kuhn]].
`,
    },
  });
  expect(planted.status()).toBe(201);

  // Syncing adopts both marks: listed, and painted.
  await page.goto(`/read/${documentId}`);
  await page.waitForFunction(() => document.querySelectorAll(".textLayer span").length > 0, undefined, { timeout: 15_000 });
  await syncNow(page);
  await page.getByRole("tab", { name: "Marks" }).click();
  const marks = page.getByRole("region", { name: "Saved highlights" });
  await expect(marks).toContainText("Chapter 1: Introduction");
  await expect(marks).toContainText("A Role for History");
  await expect.poll(() => page.evaluate(() => {
    const registered = CSS.highlights.get("book-reader-blue");
    return registered ? [...registered].map((range) => range.toString()) : null;
  })).toEqual(["Chapter 1: Introduction"]);

  // Deleted here, plus one of this device's own: the vault ends up with the
  // other device's remaining mark, this device's new one, and its own text.
  await page.getByRole("button", { name: "Delete highlight: A Role for History" }).click();
  await markLine(page, "History, if viewed as a repository", "yellow");
  await syncNow(page);

  const { text } = (await (await page.request.get(noteUrl(name))).json()) as { text: string };
  expect(text).toContain("> Chapter 1: Introduction");
  expect(text).toContain("> History, if viewed as a repository");
  expect(text).not.toContain("A Role for History");
  expect(text).toContain("## My reading\n\nLinks to [[Kuhn]].\n");
});

test("offline, a mark is kept here and goes when the connection is back", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentId = await importDocument(page, "vault-offline.pdf", MULTIPAGE_PDF, "application/pdf");
  await page.goto(`/read/${documentId}`);
  await page.waitForFunction(() => document.querySelectorAll(".textLayer span").length > 0, undefined, { timeout: 15_000 });

  await context.setOffline(true);
  await markLine(page, "A Role for History", "pink");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "waiting");
  await expect(page.locator("[data-sync-state]")).toContainText("Offline");

  await context.setOffline(false);
  await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "synced", { timeout: 15_000 });
  const stored = await page.request.get(noteUrl(noteName("vault-offline", documentId)));
  expect(stored.status()).toBe(200);
  expect(((await stored.json()) as { text: string }).text).toContain("> A Role for History");
});

test("the library lists notes in the vault whose file is not on this device", async ({ page }) => {
  await page.request.put(noteUrl("Elsewhere Paper (deadbeef).md"), {
    data: { message: "elsewhere", text: "---\ntitle: Elsewhere Paper\n---\n<!-- book-reader:start -->\n<!-- book-reader:end -->\n" },
  });
  await page.goto("/");
  const elsewhere = page.getByRole("region", { name: "In your vault" });
  await expect(elsewhere).toBeVisible();
  await expect(elsewhere).toContainText("Elsewhere Paper");
  await expect(elsewhere).toContainText("Open the same file here");
});
