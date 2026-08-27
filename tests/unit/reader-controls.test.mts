import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FONT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  normalizeFontSize,
} from "../../src/components/reader-controls.tsx";

test("preference keys are stable across releases", () => {
  assert.equal(FONT_SIZE_STORAGE_KEY, "book-reader-font-size");
  assert.equal(THEME_STORAGE_KEY, "book-reader-theme");
});

test("an unset font size preference starts at 100 percent", () => {
  // Number(null) and Number("") are 0, which used to clamp to the minimum.
  assert.equal(normalizeFontSize(null), 100);
  assert.equal(normalizeFontSize(""), 100);
  assert.equal(normalizeFontSize("   "), 100);
});

test("a stored font size is clamped to the supported range", () => {
  assert.equal(normalizeFontSize("110"), 110);
  assert.equal(normalizeFontSize("10"), 80);
  assert.equal(normalizeFontSize("500"), 180);
  assert.equal(normalizeFontSize("113.4"), 113);
});

test("an unreadable font size preference falls back to 100 percent", () => {
  assert.equal(normalizeFontSize("large"), 100);
});
