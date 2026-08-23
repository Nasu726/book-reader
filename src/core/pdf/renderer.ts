import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${version}`;

export async function extractNormalizedPdfText(
  data: ArrayBuffer,
): Promise<{ pages: string[] }> {
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const { items } = await page.getTextContent();
        let text = "";
        for (const item of items) {
          if (!("str" in item) || typeof item.str !== "string") {
            continue;
          }
          text += item.str;
          if (item.hasEOL === true) {
            text += "\n";
          }
        }
        pages.push(text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
      } finally {
        page.cleanup();
      }
    }
    return { pages };
  } finally {
    await loadingTask.destroy();
  }
}
