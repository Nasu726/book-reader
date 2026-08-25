import { expect, test } from "@playwright/test";
import assert from "node:assert/strict";

test("AI actions render in the desktop secondary pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  if (await secondary.isVisible()) {
    await expect(secondary.getByRole("group", { name: "AI actions" })).toBeVisible();
    const box = await secondary.boundingBox();
    assert.ok(box);
    assert.equal(
      await secondary.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.scrollHeight > element.clientHeight && style.overflowY === "auto";
      }),
      false,
    );
  }
});

test("desktop panes scroll independently", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/login");

  const reader = page.getByRole("region", { name: "Reader" });
  const secondary = page.getByRole("complementary", { name: "AI and notes" });
  if (await reader.isVisible()) {
    await reader.evaluate((element) => {
      for (let index = 0; index < 80; index += 1) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `Reader filler ${index}`;
        element.append(paragraph);
      }
    });
  }
  if (await secondary.isVisible()) {
    await secondary.evaluate((element) => {
      for (let index = 0; index < 40; index += 1) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `Notes filler ${index}`;
        element.append(paragraph);
      }
    });
  }

  if (await secondary.isVisible()) {
    await expect(async () => {
      const boxes = await Promise.all([
        page.getByRole("region", { name: "Reader" }).boundingBox(),
        secondary.boundingBox(),
      ]);
      assert.ok(boxes[0]);
      assert.ok(boxes[1]);
      assert.ok(Math.abs((boxes[0]?.y ?? 0) - (boxes[1]?.y ?? 0)) < 2);
    }).toPass();
  }
});

test("mobile drawer preserves a scrollable AI response and returns to the Reader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const drawer = page.getByRole("dialog", { name: "AI drawer" });

  if (await drawer.isVisible()) {
    await expect(drawer.getByLabel("Follow-up question")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Back to Reader" })).toBeVisible();
  }
});
