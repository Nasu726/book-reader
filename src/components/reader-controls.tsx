"use client";

import { useEffect, useState } from "react";

export type ReaderTheme = "light" | "dark";
export const FONT_SIZE_STORAGE_KEY = "book-reader-font-size";
export const THEME_STORAGE_KEY = "book-reader-theme";

function normalizeFontSize(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.min(180, Math.max(80, Math.round(parsed)));
}

export function ReaderControls() {
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [fontSize, setFontSize] = useState(100);

  useEffect(() => {
    const storedTheme =
      localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    queueMicrotask(() => {
      setTheme(storedTheme);
      setFontSize(
        normalizeFontSize(localStorage.getItem(FONT_SIZE_STORAGE_KEY)),
      );
    });
  }, []);

  function applyTheme(nextTheme: ReaderTheme) {
    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
  }

  function applyFontSize(nextSize: number) {
    const bounded = Math.min(180, Math.max(80, nextSize));
    setFontSize(bounded);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(bounded));
    document.documentElement.style.fontSize = `${bounded}%`;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <button
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
        type="button"
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <div aria-label="Font size" className="flex items-center gap-2" role="group">
        <button
          className="h-11 w-11 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          onClick={() => applyFontSize(fontSize - 10)}
          type="button"
        >
          -
        </button>
        <span className="w-14 text-center text-sm">{fontSize}%</span>
        <button
          className="h-11 w-11 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          onClick={() => applyFontSize(fontSize + 10)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}
