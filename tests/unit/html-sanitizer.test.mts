import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import {
  sanitizeSectionHtml,
  toReadableText,
} from "../../src/core/documents/html-sanitizer.ts";

function body(markup: string) {
  return parseHTML(`<html><body>${markup}</body></html>`).document.body;
}

test("structural chapter markup survives sanitizing", () => {
  const html = sanitizeSectionHtml(
    body("<h1>Chapter One</h1><p>First <em>paragraph</em>.</p><p>Second.</p>"),
  );
  assert.equal(
    html,
    "<h1>Chapter One</h1><p>First <em>paragraph</em>.</p><p>Second.</p>",
  );
});

test("scripts and their source are removed entirely", () => {
  const html = sanitizeSectionHtml(
    body("<p>Before</p><script>alert('xss')</script><p>After</p>"),
  );
  assert.equal(html, "<p>Before</p><p>After</p>");
  assert.ok(!html.includes("alert"));
});

test("event handlers, styles, and every other attribute are dropped", () => {
  const html = sanitizeSectionHtml(
    body('<p onclick="steal()" style="position:fixed" class="x" id="y">Text</p>'),
  );
  assert.equal(html, "<p>Text</p>");
});

test("links and images cannot smuggle a URL into the reader", () => {
  const html = sanitizeSectionHtml(
    body('<p><a href="javascript:alert(1)">click</a><img src="x" onerror="alert(1)"></p>'),
  );
  assert.equal(html, "<p><a>click</a></p>");
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("onerror"));
});

test("embedded frames and vector markup are removed with their content", () => {
  const html = sanitizeSectionHtml(
    body('<iframe src="https://evil.test"></iframe><svg><script>alert(1)</script></svg><p>Kept</p>'),
  );
  assert.equal(html, "<p>Kept</p>");
});

test("text is escaped so authored markup cannot break out", () => {
  const html = sanitizeSectionHtml(body("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>"));
  assert.equal(html, "<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>");
});

test("unknown elements keep their text but lose the element", () => {
  const html = sanitizeSectionHtml(body("<custom-block><p>Inside</p></custom-block>"));
  assert.equal(html, "<p>Inside</p>");
});

test("readable text separates block boundaries instead of joining words", () => {
  const text = toReadableText(
    body("<h1>Title</h1><p>Sentence one.</p><p>Sentence two.</p>"),
  );
  assert.equal(text, "Title\n\nSentence one.\n\nSentence two.");
});

test("readable text excludes dropped elements", () => {
  const text = toReadableText(body("<p>Visible</p><script>secret()</script>"));
  assert.equal(text, "Visible");
});

test("missing bodies degrade to empty output rather than throwing", () => {
  assert.equal(sanitizeSectionHtml(null), "");
  assert.equal(toReadableText(undefined), "");
});
