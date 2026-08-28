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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <button
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        onClick={() => setStoredTheme(theme === "dark" ? "light" : "dark" satisfies ReaderTheme)}
        type="button"
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      {showTextSize && (
      <div aria-label="Text size" className="flex items-center gap-2" role="group">
        <button
          aria-label="Decrease text size"
          className="h-11 w-11 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          disabled={fontSize <= MIN_FONT_SIZE}
          onClick={() => stepFontSize(-FONT_SIZE_STEP)}
          type="button"
        >
          -
        </button>
        <span aria-live="polite" className="w-14 text-center text-sm">{fontSize}%</span>
        <button
          aria-label="Increase text size"
          className="h-11 w-11 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          disabled={fontSize >= MAX_FONT_SIZE}
          onClick={() => stepFontSize(FONT_SIZE_STEP)}
          type="button"
        >
          +
        </button>
      </div>
      )}
    </div>
  );
}
