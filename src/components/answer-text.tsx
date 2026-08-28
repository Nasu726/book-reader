import type { ReactNode } from "react";

/**
 * Renders the light Markdown that language models produce — headings, lists,
 * bold, italic, inline code — as React nodes.
 *
 * Nodes, not an HTML string: the model's answer is untrusted text, and building
 * elements directly means there is no markup for it to escape into.
 *
 * ponytail: deliberately not a Markdown implementation. Tables, block quotes,
 * links, and fenced-code languages are ignored and shown as written. Reach for
 * a real parser only when an answer actually needs them.
 */

const BOLD_ITALIC_CODE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(BOLD_ITALIC_CODE).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 4 && part.startsWith("__") && part.endsWith("__")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return <code className="rounded bg-rule/40 px-1" key={key}>{part.slice(1, -1)}</code>;
    }
    // Plain runs stay plain strings; React escapes them and the DOM stays flat.
    return part;
  });
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string };

function toBlocks(answer: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }

  for (const line of answer.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      const last = blocks.at(-1);
      if (last?.type === "list" && last.ordered === ordered) {
        last.items.push(item);
      } else {
        blocks.push({ type: "list", ordered, items: [item] });
      }
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

export function AnswerText({ children }: { children: string }) {
  const blocks = toBlocks(children);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.type === "heading") {
          const level = Math.min(block.level + 2, 6);
          const Heading = `h${level}` as"h3" |"h4" |"h5" |"h6";
          return (
            <Heading className="font-semibold" key={key}>
              {renderInline(block.text, key)}
            </Heading>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              className={`space-y-1 ps-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
              key={key}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p className="whitespace-pre-wrap" key={key}>
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}
