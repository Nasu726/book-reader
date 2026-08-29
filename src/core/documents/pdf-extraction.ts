export type PdfTextItem = {
  height?: number;
  str: string;
  transform?: readonly number[];
  width?: number;
};

type PositionedItem = {
  baseline: number;
  left: number;
  right: number;
  text: string;
};

function itemBounds(item: PdfTextItem): PositionedItem | null {
  const transform = item.transform;
  if (!Array.isArray(transform) || transform.length < 6 || !item.str.trim()) {
    return null;
  }
  const left = Number(transform[4]);
  const baseline = Number(transform[5]);
  if (!Number.isFinite(left) || !Number.isFinite(baseline)) return null;

  const width = typeof item.width === "number" && Number.isFinite(item.width)
    ? item.width
    : Math.max(1, item.str.length * Math.abs(Number(transform[0]) || 1));
  const right = left + Math.max(1, width);
  return { baseline, left, right, text: item.str };
}

type MeasuredLine = {
  /** Where the line sits down the page; larger is higher. */
  baseline: number;
  left: number;
  right: number;
  text: string;
};

/**
 * The lines of a page, in reading order, with the geometry that produced them.
 *
 * extractPdfText joins these with newlines and throws the rest away, which is
 * all the AI context needs. Reading the page as prose needs to know where the
 * paragraphs are, and the only reliable evidence for that is the layout.
 */
function measureLines(items: readonly PdfTextItem[]): MeasuredLine[][] {
  const bounds = items.map(itemBounds).filter((item): item is PositionedItem => item !== null);
  if (bounds.length === 0) return [];

  const pageLeft = Math.min(...bounds.map((item) => item.left));
  const pageRight = Math.max(...bounds.map((item) => item.right));
  const pageWidth = pageRight - pageLeft;
  const midpoint = pageLeft + pageWidth / 2;

  const orderedBounds = [...bounds].sort((left, right) => right.baseline - left.baseline || left.left - right.left);
  const minimumGap = pageWidth * 0.04;
  const leftItems = bounds.filter((item) => item.right <= midpoint).length;
  const rightItems = bounds.filter((item) => item.left >= midpoint).length;
  const crossingItems = bounds.filter((item) => item.left < midpoint && item.right > midpoint).length;
  const leftLines = new Set(bounds.filter((item) => item.right <= midpoint).map((item) => item.baseline)).size;
  const rightLines = new Set(bounds.filter((item) => item.left >= midpoint).map((item) => item.baseline)).size;
  const hasCentralGutter =
    leftItems >= Math.ceil(bounds.length * 0.25) &&
    rightItems >= Math.ceil(bounds.length * 0.25) &&
    leftLines >= 2 &&
    rightLines >= 2 &&
    crossingItems === 0 &&
    [...bounds].sort((left, right) => left.left - right.left).some((item, index) => {
      if (index === 0) return false;
      return item.left - orderedBounds[index - 1].right >= minimumGap;
    });
  const columns = hasCentralGutter ? [
    { left: pageLeft, right: midpoint },
    { left: midpoint, right: pageRight },
  ] : [{ left: pageLeft, right: pageRight }];

  return columns.map((column) => {
    const lines = new Map<number, PositionedItem[]>();
    for (const item of bounds.filter((candidate) => (
      candidate.left >= column.left - 1 &&
      candidate.left < column.right
    ))) {
      let lineBaseline = item.baseline;
      for (const [existing] of lines) {
        const tolerance = 3;
        if (Math.abs(existing - lineBaseline) <= tolerance) {
          lineBaseline = existing;
          break;
        }
      }
      lines.set(lineBaseline, [...lines.get(lineBaseline) ?? [], item]);
    }

    return [...lines.entries()]
      .sort(([left], [right]) => right - left)
      .map(([baseline, lineItems]) => {
        const ordered = [...lineItems].sort((left, right) => left.left - right.left);
        return {
          baseline,
          left: Math.min(...ordered.map((item) => item.left)),
          right: Math.max(...ordered.map((item) => item.right)),
          text: ordered.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
        };
      })
      .filter((line) => line.text);
  }).filter((column) => column.length > 0);
}

/** The middle value, which a stray double-spaced line cannot drag around. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * A page as paragraphs, for reading rather than for feeding to a model.
 *
 * Where a paragraph ends is a question about the page's layout, and the layout
 * is right here: a line that stops short of the margin is the last line of
 * something, an unusually large step down the page is a break, and a line that
 * starts further in than its neighbours is the first of a new paragraph.
 * Guessing from the words instead — looking for full stops and capital letters
 * — gets titles and headings wrong, which are exactly the lines a reader uses
 * to find their place.
 */
export function extractPdfParagraphs(items: readonly PdfTextItem[]): string[] {
  const paragraphs: string[] = [];

  for (const lines of measureLines(items)) {
    const columnRight = Math.max(...lines.map((line) => line.right));
    const columnLeft = Math.min(...lines.map((line) => line.left));
    const columnWidth = Math.max(1, columnRight - columnLeft);
    const steps = lines.slice(1).map((line, index) => lines[index].baseline - line.baseline);
    const usualStep = median(steps.filter((step) => step > 0));

    let current: string[] = [];
    const flush = () => {
      if (current.length > 0) paragraphs.push(current.join(" "));
      current = [];
    };

    lines.forEach((line, index) => {
      const previous = lines[index - 1];
      if (previous) {
        const step = previous.baseline - line.baseline;
        const stepped = usualStep > 0 && step > usualStep * 1.5;
        const indented = line.left - columnLeft > columnWidth * 0.03;
        if (stepped || indented) flush();
      }
      // A hyphen at a line end is a word cut in half, not punctuation.
      const previousText = current[current.length - 1];
      if (previousText?.endsWith("-") && /^[a-z]/.test(line.text)) {
        current[current.length - 1] = previousText.slice(0, -1) + line.text;
      } else {
        current.push(line.text);
      }
      // A line that stops short of the margin has nothing following it on the
      // same line, which for justified and ragged text alike means the end.
      if (line.right < columnLeft + columnWidth * 0.8) flush();
    });
    flush();
  }

  return paragraphs.filter((paragraph) => paragraph.trim());
}

export function extractPdfText(items: readonly PdfTextItem[]): string {
  const bounds = items.map(itemBounds).filter((item): item is PositionedItem => item !== null);
  if (bounds.length === 0) return "";

  const pageLeft = Math.min(...bounds.map((item) => item.left));
  const pageRight = Math.max(...bounds.map((item) => item.right));
  const pageWidth = pageRight - pageLeft;
  const midpoint = pageLeft + pageWidth / 2;

  const orderedBounds = [...bounds].sort((left, right) => right.baseline - left.baseline || left.left - right.left);
  const adjacentGaps: number[] = [];
  for (let index = 1; index < orderedBounds.length; index += 1) {
    const gap = orderedBounds[index].left - orderedBounds[index - 1].right;
    if (gap > 0) adjacentGaps.push(gap);
  }
  const minimumGap = pageWidth * 0.04;
  const leftItems = bounds.filter((item) => item.right <= midpoint).length;
  const rightItems = bounds.filter((item) => item.left >= midpoint).length;
  const crossingItems = bounds.filter((item) => item.left < midpoint && item.right > midpoint).length;
  const leftLines = new Set(bounds.filter((item) => item.right <= midpoint).map((item) => item.baseline)).size;
  const rightLines = new Set(bounds.filter((item) => item.left >= midpoint).map((item) => item.baseline)).size;
  const hasCentralGutter =
    leftItems >= Math.ceil(bounds.length * 0.25) &&
    rightItems >= Math.ceil(bounds.length * 0.25) &&
    leftLines >= 2 &&
    rightLines >= 2 &&
    crossingItems === 0 &&
    [...bounds].sort((left, right) => left.left - right.left).some((item, index) => {
      if (index === 0) return false;
      return item.left - orderedBounds[index - 1].right >= minimumGap;
    });
  const columns = hasCentralGutter ? [
    { left: pageLeft, right: midpoint },
    { left: midpoint, right: pageRight },
  ] : [{ left: pageLeft, right: pageRight }];

  return columns.flatMap((column) => {
    const lines = new Map<number, PositionedItem[]>();
    for (const item of bounds.filter((candidate) => (
      candidate.left >= column.left - 1 &&
      candidate.left < column.right
    ))) {
      let lineBaseline = item.baseline;
      for (const [existing] of lines) {
        const tolerance = 3;
        if (Math.abs(existing - lineBaseline) <= tolerance) {
          lineBaseline = existing;
          break;
        }
      }
      lines.set(lineBaseline, [...lines.get(lineBaseline) ?? [], item]);
    }

    return [...lines.entries()]
      .sort(([left], [right]) => right - left)
      .map(([, lineItems]) => lineItems.sort((left, right) => left.left - right.left).map((item) => item.text).join(" "))
      .filter((line) => line.trim());
  }).map((columnText) => columnText.replace(/\s+/g, " ").trim()).join("\n").trim();
}
