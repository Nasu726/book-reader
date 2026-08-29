import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const CSS = readFileSync(join(import.meta.dirname, "../../src/app/globals.css"), "utf8");

/** The tokens as they are declared for one theme. */
function palette(theme: "light" | "dark"): Record<string, string> {
  // Light is the bare :root block; dark restates only what changes, and both
  // copies of it must agree, so reading the chosen-theme block covers the pair.
  const block = theme === "light"
    ? CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("@theme inline"))
    : CSS.slice(CSS.indexOf(":root.dark {"), CSS.indexOf("}", CSS.indexOf(":root.dark {")));
  const values: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
    values[name] = value;
  }
  return theme === "light" ? values : { ...palette("light"), ...values };
}

function channel(component: number): number {
  const fraction = component / 255;
  return fraction <= 0.03928
    ? fraction / 12.92
    : ((fraction + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((first, second) => second - first);
  return (high + 0.05) / (low + 0.05);
}

/**
 * The palette is checked rather than trusted.
 *
 * Every one of these was wrong at some point, and none of it showed up in a
 * screenshot taken by someone who already knew where the controls were: the
 * borders sat at 1.26:1, which is a boundary nobody can see and which made the
 * dark theme in particular read as one undifferentiated surface.
 */
for (const theme of ["light", "dark"] as const) {
  test(`the ${theme} palette stays legible`, () => {
    const colours = palette(theme);
    for (const name of ["paper", "paper-raised", "ink", "ink-quiet", "rule", "edge", "field", "marker"]) {
      assert.ok(colours[name], `--${name} is missing from the ${theme} palette`);
    }

    const onPaper = (name: string) => contrast(colours[name], colours.paper);

    // Body text, and the quieter text beside it. WCAG AA asks 4.5:1.
    assert.ok(onPaper("ink") >= 7, `ink is ${onPaper("ink").toFixed(2)}:1 on paper`);
    assert.ok(onPaper("ink-quiet") >= 4.5, `ink-quiet is ${onPaper("ink-quiet").toFixed(2)}:1 on paper`);

    // The edge of something you can press or type into is not decoration: it
    // says where the control is. WCAG 1.4.11 asks 3:1 for exactly this.
    assert.ok(onPaper("edge") >= 3, `edge is ${onPaper("edge").toFixed(2)}:1 on paper`);

    // A field has to be tellable from the paper it sits on, though it is a
    // surface rather than a boundary and does not owe the same ratio.
    assert.notEqual(colours.field, colours.paper, "a field must differ from the paper");

    // Text on the highlighter, which stays yellow in both themes.
    assert.ok(
      contrast(colours["ink-on-marker"], colours.marker) >= 4.5,
      `text on the marker is ${contrast(colours["ink-on-marker"], colours.marker).toFixed(2)}:1`,
    );
  });
}

test("the two dark declarations agree", () => {
  // One for a chosen theme, one for the system preference. They drift apart the
  // moment a colour is changed in only one of them, and nothing on screen says so.
  const chosen = CSS.slice(CSS.indexOf(":root.dark {"));
  const preferred = CSS.slice(CSS.indexOf(":root:not(.light) {"));
  const read = (source: string) => [...source.slice(0, source.indexOf("}")).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)]
    .map(([, name, value]) => `${name}:${value}`);
  assert.deepEqual(read(chosen), read(preferred));
});
