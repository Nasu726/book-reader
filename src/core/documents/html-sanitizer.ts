/**
 * Allowlist sanitizer for EPUB section markup.
 *
 * EPUB chapters are XHTML authored by a third party, so the reader must not
 * trust them. Everything is denied by default: only the structural tags below
 * survive, and every attribute is dropped, which removes `on*` handlers,
 * inline styles, and any external reference along with them.
 */

const ALLOWED_TAGS = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption", "cite",
  "code", "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "h1",
  "h2", "h3", "h4", "h5", "h6", "hr", "i", "ins", "kbd", "li", "mark", "ol",
  "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "span",
  "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "u", "ul", "var",
]);

// Elements whose text content must not leak into the reader even though the
// element itself is dropped (a dropped <script> must not print its source).
const DROP_WITH_CONTENT = new Set([
  "script", "style", "template", "head", "title", "meta", "link", "noscript",
  "iframe", "object", "embed", "svg", "math", "form", "input", "select",
  "textarea", "button", "audio", "video", "canvas",
]);

const VOID_TAGS = new Set(["br", "hr"]);

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type MinimalNode = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<MinimalNode>;
};

function sanitizeNode(node: MinimalNode): string {
  if (node.nodeType === 3) {
    return escapeText(node.textContent ?? "");
  }
  if (node.nodeType !== 1) {
    return "";
  }

  const tag = node.nodeName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) {
    return "";
  }

  const children = Array.from(node.childNodes).map(sanitizeNode).join("");
  if (!ALLOWED_TAGS.has(tag)) {
    // Unknown but harmless wrapper: keep the text, discard the element.
    return children;
  }
  if (VOID_TAGS.has(tag)) {
    return `<${tag} />`;
  }
  return `<${tag}>${children}</${tag}>`;
}

/**
 * Returns sanitized markup for the body of an EPUB section document, or an
 * empty string when the document has no usable body.
 */
export function sanitizeSectionHtml(body: MinimalNode | null | undefined): string {
  if (!body) return "";
  return Array.from(body.childNodes).map(sanitizeNode).join("").trim();
}

const BLOCK_TAGS = new Set([
  "article", "aside", "blockquote", "caption", "dd", "div", "dl", "dt",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol",
  "p", "pre", "section", "table", "tr", "ul",
]);

function collectText(node: MinimalNode, out: string[]): void {
  if (node.nodeType === 3) {
    out.push(node.textContent ?? "");
    return;
  }
  if (node.nodeType !== 1) return;

  const tag = node.nodeName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return;

  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock || tag === "br") out.push("\n");
  for (const child of Array.from(node.childNodes)) collectText(child, out);
  if (isBlock) out.push("\n");
}

/**
 * Plain text that preserves block boundaries, so paragraphs stay separated for
 * AI context instead of running the last word of one into the next.
 */
export function toReadableText(body: MinimalNode | null | undefined): string {
  if (!body) return "";
  const parts: string[] = [];
  for (const child of Array.from(body.childNodes)) collectText(child, parts);
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
