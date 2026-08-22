import type {
  ParsedDocument,
  ParsedDocumentSection,
} from "../core/documents/parser.ts";

export const EPUB_LOCATION_VERSION = 1;

export type EpubReaderLocation = {
  version: typeof EPUB_LOCATION_VERSION;
  sectionId: string;
  characterOffset?: number;
};

export type EpubFontSizeChange = {
  previousOffset: number;
  ratio: number;
};

export class EpubReader {
  readonly #sectionsById = new Map<string, ParsedDocumentSection>();

  readonly #document: ParsedDocument;

  constructor(document: ParsedDocument) {
    this.#document = document;
    for (const section of document.sections) {
      this.#sectionsById.set(section.id, section);
    }
  }

  get sections(): readonly ParsedDocumentSection[] {
    return this.#document.sections;
  }

  open(location?: string): EpubReaderLocation {
    return location ? this.decodeLocation(location) : this.firstLocation();
  }

  restore(location: string): EpubReaderLocation {
    return this.decodeLocation(location);
  }

  nextSection(location: string): EpubReaderLocation | null {
    return this.#move(location, 1);
  }

  previousSection(location: string): EpubReaderLocation | null {
    return this.#move(location, -1);
  }

  encodeLocation(location: EpubReaderLocation): string {
    return JSON.stringify({
      ...location,
      version: EPUB_LOCATION_VERSION,
    });
  }

  applyFontSizeChange(
    location: string,
    change: EpubFontSizeChange,
  ): EpubReaderLocation {
    const restored = this.restore(location);
    const section = this.#sectionsById.get(restored.sectionId);
    if (!section || !Number.isFinite(change.ratio) || change.ratio <= 0) {
      return restored;
    }

    return {
      ...restored,
      characterOffset: Math.max(
        0,
        Math.min(
          section.content.length,
          Math.round(change.previousOffset * change.ratio),
        ),
      ),
    };
  }

  #first(): ParsedDocumentSection {
    const section = this.#document.sections[0];
    if (!section) {
      throw new Error("The EPUB has no readable sections.");
    }
    return section;
  }

  firstLocation(): EpubReaderLocation {
    return { version: EPUB_LOCATION_VERSION, sectionId: this.#first().id };
  }

  decodeLocation(location: string): EpubReaderLocation {
    let parsed: unknown;
    try {
      parsed = JSON.parse(location);
    } catch (cause) {
      throw new Error("Invalid EPUB reader location.", { cause });
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as EpubReaderLocation).version !== EPUB_LOCATION_VERSION ||
      typeof (parsed as EpubReaderLocation).sectionId !== "string"
    ) {
      throw new Error("Unsupported EPUB reader location.");
    }

    const candidate = parsed as EpubReaderLocation;
    if (!this.#sectionsById.has(candidate.sectionId)) {
      throw new Error("Unknown EPUB section.");
    }

    const characterOffset =
      candidate.characterOffset === undefined
        ? undefined
        : Number(candidate.characterOffset);
    if (
      characterOffset !== undefined &&
      (!Number.isInteger(characterOffset) || characterOffset < 0)
    ) {
      throw new Error("Invalid EPUB reading offset.");
    }

    return {
      version: EPUB_LOCATION_VERSION,
      sectionId: candidate.sectionId,
      characterOffset:
        characterOffset === undefined
          ? undefined
          : Math.min(characterOffset, this.#contentLength(candidate.sectionId)),
    };
  }

  #move(from: string, delta: number): EpubReaderLocation | null {
    const current = this.decodeLocation(from);
    const currentIndex = this.#document.sections.findIndex(
      (section) => section.id === current.sectionId,
    );
    if (currentIndex === -1) {
      return null;
    }

    const target = this.#document.sections[currentIndex + delta];
    if (!target) {
      return null;
    }

    return {
      version: EPUB_LOCATION_VERSION,
      sectionId: target.id,
    };
  }

  #contentLength(sectionId: string): number {
    return this.#sectionsById.get(sectionId)?.content.length ?? 0;
  }
}
