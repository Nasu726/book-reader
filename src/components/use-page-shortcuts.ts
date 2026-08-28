"use client";

import { useEffect } from "react";

/**
 * Left and right arrows turn the page.
 *
 * Only the horizontal arrows are claimed. Up, Down, Page Up, Page Down, and
 * Space still scroll, which a long EPUB chapter needs, and typing in the
 * follow-up question or a note must never move the reader.
 */
export function usePageShortcuts(options: {
  /** Omit at the first page: the key press should then do nothing at all. */
  onPrevious?: () => void;
  /** Omit at the last page. */
  onNext?: () => void;
  enabled?: boolean;
}): void {
  const { enabled = true, onNext, onPrevious } = options;

  useEffect(() => {
    if (!enabled) return;

    function isTyping(target: EventTarget | null): boolean {
      const element = target as HTMLElement | null;
      if (!element) return false;
      if (element.isContentEditable) return true;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }
      const move = event.key === "ArrowLeft"
        ? onPrevious
        : event.key === "ArrowRight" ? onNext : undefined;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // At an end there is nothing to move to, but the arrow still belongs to
      // the reader rather than scrolling the page sideways.
      event.preventDefault();
      move?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onNext, onPrevious]);
}
