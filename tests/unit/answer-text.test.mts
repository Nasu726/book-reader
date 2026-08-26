import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AnswerText } from "../../src/components/answer-text.tsx";

function render(answer: string): string {
  return renderToStaticMarkup(AnswerText({ children: answer }));
}

test("bold, italic, and inline code become elements", () => {
  const html = render("A **bold** and *italic* and `code` answer.");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code[^>]*>code<\/code>/);
  assert.ok(!html.includes("**"));
});

test("headings become subordinate headings, never h1", () => {
  const html = render("# Title\n\nBody text.");
  assert.match(html, /<h3[^>]*>Title<\/h3>/);
  assert.match(html, /<p[^>]*>Body text\.<\/p>/);
});

test("bulleted and numbered lists render as lists", () => {
  const bulleted = render("- first\n- second");
  assert.match(bulleted, /<ul[^>]*>[\s\S]*<li>first<\/li><li>second<\/li>[\s\S]*<\/ul>/);

  const numbered = render("1. first\n2. second");
  assert.match(numbered, /<ol[^>]*>[\s\S]*<li>first<\/li><li>second<\/li>[\s\S]*<\/ol>/);
});

test("blank lines separate paragraphs", () => {
  const html = render("First paragraph.\n\nSecond paragraph.");
  assert.equal(html.match(/<p/g)?.length, 2);
});

test("an answer containing markup is shown as text, never as elements", () => {
  const html = render('<img src=x onerror="alert(1)"> and <script>alert(1)</script>');
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.match(html, /&lt;script&gt;/);
});

test("an empty answer renders nothing", () => {
  assert.equal(render("   \n  \n"), "");
});
