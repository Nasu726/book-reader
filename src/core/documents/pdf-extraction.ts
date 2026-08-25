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
