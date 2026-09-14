import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRoute, routeTo } from "../../src/router.ts";

test("paths name the three screens and nothing else", () => {
  assert.deepEqual(parseRoute("/"), { screen: "library" });
  assert.deepEqual(parseRoute("/help"), { screen: "help" });
  assert.deepEqual(parseRoute("/read/8f2a1c"), { screen: "read", id: "8f2a1c" });
  assert.deepEqual(parseRoute("/read/8f2a1c/"), { screen: "read", id: "8f2a1c" });
  // A malformed id is not a document; the library is the safe place to land.
  assert.deepEqual(parseRoute("/read/../etc"), { screen: "library" });
  assert.deepEqual(parseRoute("/nothing"), { screen: "library" });
});

test("routes round-trip through the path", () => {
  for (const route of [{ screen: "library" }, { screen: "help" }, { screen: "read", id: "abc" }] as const) {
    assert.deepEqual(parseRoute(routeTo(route)), route);
  }
});
