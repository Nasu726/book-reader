"use client";

import { useRef, type ReactNode } from "react";

export type SecondaryTab = "ai" | "saved";

const TABS: { id: SecondaryTab; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "saved", label: "Saved" },
];

/**
 * Splits the pane beside the text into what the AI is doing and what the reader
 * has saved.
 *
 * They were stacked, so the highlights, the note, and the vocabulary form sat
 * below an answer that could be any length — reachable only by scrolling past
 * it. They are not part of asking a question, either: a highlight is kept
 * whether or not a model was ever involved.
 *
 * Both panels stay mounted and one is hidden, so switching tabs does not throw
 * away a half-typed meaning or scroll an answer back to the top.
 */
export function SecondaryTabs({
  active,
  onChange,
  ai,
  saved,
}: {
  active: SecondaryTab;
  onChange: (tab: SecondaryTab) => void;
  ai: ReactNode;
  saved: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-label="Panel"
        className="mb-4 flex shrink-0 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900"
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          // The reader's own arrow keys turn the page, and they listen on the
          // window. Inside the tab bar the arrows belong to the tabs.
          event.stopPropagation();
          event.preventDefault();
          const next = TABS[(TABS.findIndex((tab) => tab.id === active) + step + TABS.length) % TABS.length];
          onChange(next.id);
          listRef.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
        }}
        ref={listRef}
        role="tablist"
      >
        {TABS.map((tab) => (
          <button
            aria-controls={`panel-${tab.id}`}
            aria-selected={active === tab.id}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
              active === tab.id
                ? "bg-white shadow-sm dark:bg-zinc-800"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
            id={`tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            // Roving focus: only the selected tab is a tab stop, and the arrows
            // move between them from there.
            tabIndex={active === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map((tab) => (
        <div
          aria-labelledby={`tab-${tab.id}`}
          className="min-h-0 flex-1 space-y-4 lg:overflow-visible"
          hidden={active !== tab.id}
          id={`panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
          // A hidden panel is not focusable, so the panel itself is the stop
          // that follows the tabs for anyone arriving by keyboard.
          tabIndex={active === tab.id ? 0 : -1}
        >
          {tab.id === "ai" ? ai : saved}
        </div>
      ))}
    </div>
  );
}
