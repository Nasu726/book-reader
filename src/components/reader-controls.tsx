"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  applyFontScaleToDocument,
  applyThemeToDocument,
  FONT_SIZE_STEP,
  getStoredFontSize,
  getStoredTheme,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  serverFontSize,
  serverTheme,
  setStoredFontSize,
  setStoredTheme,
  subscribe,
  type ReaderTheme,
} from "./reader-preferences";

export {
  FONT_SIZE_STORAGE_KEY,
  normalizeFontSize,
  THEME_STORAGE_KEY,
  type ReaderTheme,
} from "./reader-preferences";

/**
 * Theme is always meaningful. Text size only is where reflowable text is being
 * shown: it scales `.reader-prose`, which is the EPUB body and nothing else, so
 * on a PDF the control moved a number and changed nothing on screen. A PDF's
 * equivalent is the zoom control in the reader's own toolbar (SPEC READ-005).
 */
export function ReaderControls({ showTextSize = false }: { showTextSize?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getStoredTheme, serverTheme);
  const fontSize = useSyncExternalStore(subscribe, getStoredFontSize, serverFontSize);

  // Push the stored preferences onto the document. Reading them into state
  // from an effect would fight React; applying them to the DOM is exactly what
  // an effect is for, and it also restores a saved theme after a reload, which
  // the previous version forgot to do.
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    applyFontScaleToDocument(fontSize);
  }, [fontSize]);

  function stepFontSize(delta: number) {
    setStoredFontSize(
      Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize + delta)),
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showTextSize && (
      <div aria-label="Text size" className="flex items-center" role="group">
        <button
          aria-label="Decrease text size"
          className="text-ink-quiet hover:text-ink h-11 w-8 text-base transition-colors duration-(--fast) disabled:opacity-30"
          disabled={fontSize <= MIN_FONT_SIZE}
          onClick={() => stepFontSize(-FONT_SIZE_STEP)}
          type="button"
        >
          −
        </button>
        <span aria-live="polite" className="text-ink-quiet w-12 text-center text-xs tabular-nums">{fontSize}%</span>
        <button
          aria-label="Increase text size"
          className="text-ink-quiet hover:text-ink h-11 w-8 text-base transition-colors duration-(--fast) disabled:opacity-30"
          disabled={fontSize >= MAX_FONT_SIZE}
          onClick={() => stepFontSize(FONT_SIZE_STEP)}
          type="button"
        >
          +
        </button>
      </div>
      )}
      {/* An icon, not a word. The theme is a property of the room, not an
          action worth a labelled button in the corner of every screen. The
          full-size tap target is kept; only the ink is small. */}
      <button
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="text-ink-quiet hover:text-ink flex h-11 w-11 items-center justify-center transition-colors duration-(--fast)"
        onClick={() => setStoredTheme(theme === "dark" ? "light" : "dark" satisfies ReaderTheme)}
        type="button"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden fill="none" height="18" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="18">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden fill="none" height="18" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}
