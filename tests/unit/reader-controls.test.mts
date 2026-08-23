import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FONT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "../../src/components/reader-controls.tsx";

test("reader control preference keys are stable", () => {
  assert.equal(THEME_STORAGE_KEY, "book-reader-theme");
  assert.equal(FONT_SIZE_STORAGE_KEY, "book-reader-font-size");
});
