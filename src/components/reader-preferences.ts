"use client";

export type ReaderTheme = "light" | "dark";

export const FONT_SIZE_STORAGE_KEY = "book-reader-font-size";
export const THEME_STORAGE_KEY = "book-reader-theme";

export const MIN_FONT_SIZE = 80;
export const MAX_FONT_SIZE = 180;
export const FONT_SIZE_STEP = 10;
const DEFAULT_FONT_SIZE = 100;

export function normalizeFontSize(value: string | null): number {
  // Number(null) and Number("") are 0, not NaN, so an unset preference used to
  // clamp to the 80% minimum instead of starting at 100%.
  if (value === null || value.trim() === "") {
    return DEFAULT_FONT_SIZE;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(parsed)));
}

/**
 * Reader preferences live in localStorage, which React treats as an external
 * store. Exposing them through subscribe/getSnapshot lets components read them
 * with useSyncExternalStore instead of copying them into state from an effect.
 */
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing a preference should reach this one too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function getStoredTheme(): ReaderTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function getStoredFontSize(): number {
  return normalizeFontSize(localStorage.getItem(FONT_SIZE_STORAGE_KEY));
}

/** Values the server renders with; the client corrects them after hydration. */
export const serverTheme = (): ReaderTheme => "light";
export const serverFontSize = (): number => DEFAULT_FONT_SIZE;

export function setStoredTheme(theme: ReaderTheme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  notify();
}

export function setStoredFontSize(size: number): void {
  localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(size));
  notify();
}

export function applyThemeToDocument(theme: ReaderTheme): void {
  // Both classes are explicit: `dark` drives Tailwind's dark variant, and
  // `light` is what lets someone on a dark system choose the light theme.
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.style.colorScheme = theme;
}

/**
 * Scales the book text only.
 *
 * Setting the root font size scaled every rem in the application instead,
 * which shrank buttons below a usable touch target at 80% and pulled the
 * layout apart at 180%.
 */
export function applyFontScaleToDocument(size: number): void {
  document.documentElement.style.setProperty("--reader-font-scale", String(size / 100));
  // Undo the root scaling a previous version of this control left behind.
  document.documentElement.style.fontSize = "";
}
