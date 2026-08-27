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
  onPrevious: () => void;
  onNext: () => void;
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
      if (event.key === "ArrowLeft") {
        onPrevious();
      } else if (event.key === "ArrowRight") {
        onNext();
      } else {
        return;
      }
      event.preventDefault();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onNext, onPrevious]);
}
