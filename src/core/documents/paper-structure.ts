export type PaperStructure = {
  abstract?: string;
  authors?: string;
  sections: {
    title: string;
    content: string;
  }[];
  title?: string;
};

const SECTION_PATTERNS = [
  "abstract",
  "introduction",
  "methods",
  "results",
  "discussion",
  "conclusion",
  "references",
] as const;

function normalizeHeading(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findSectionStart(lines: readonly string[], heading: string): number {
  return lines.findIndex((line) => {
    const normalized = normalizeHeading(line).toLowerCase();
    const isShortHeading = normalized.length <= heading.length;
    return isShortHeading && (
      normalized === heading ||
      new RegExp(`^(?:\\d+(?:\\.\\d+)?)\\.?\\s+${heading.replace(/[.*+?^${}()|[\\]]/g, "\\$&")}$`).test(normalized)
    );
  });
}

export function findPaperSectionTitle(
  paperStructure: PaperStructure | undefined,
  selectedText: string,
): string | undefined {
  const normalizedSelection = selectedText.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedSelection) return undefined;
  return paperStructure?.sections.find((section) =>
    section.content.toLowerCase().includes(normalizedSelection)
  )?.title;
}

export function inferPaperStructure(text: string): PaperStructure {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const structure: PaperStructure = { sections: [] };
  const knownSections = SECTION_PATTERNS.flatMap((heading) => {
    const start = findSectionStart(lines, heading);
    return start >= 0 ? [{ heading, start }] : [];
  }).sort((left, right) => left.start - right.start);

  const looksLikePaper = knownSections.length > 0;
  if (looksLikePaper && lines[0] && lines[0].length <= 200) {
    structure.title = normalizeHeading(lines[0]);
  }
  if (looksLikePaper && lines.length > 1 && lines[1]!.length <= 300 && /,|;|\band\b/i.test(lines[1])) {
    structure.authors = normalizeHeading(lines[1]);
  }

  for (let index = 0; index < knownSections.length; index += 1) {
    const section = knownSections[index];
    if (!section) continue;
    const next = knownSections[index + 1];
    const content = lines.slice(section.start + 1, next?.start ?? lines.length).join("\n").trim();
    if (content) {
      structure.sections.push({ content, title: section.heading });
      if (section.heading === "abstract") structure.abstract = content;
    }
  }

  return structure;
}
