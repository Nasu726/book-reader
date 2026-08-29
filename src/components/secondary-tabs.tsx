"use client";

import { useRef, type ReactNode } from "react";

export type SecondaryTab = "ai" | "notes" | "highlights";

const TABS: { id: SecondaryTab; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "notes", label: "Notes" },
  { id: "highlights", label: "Marks" },
];

/**
 * Splits the pane beside the text into three things that are not each other.
 *
 * The conversation, what the reader wrote, and what the reader marked. They
 * were stacked in one column at first, so the note and the vocabulary sat below
 * an answer of unpredictable length; putting the marks in with them only moved
 * the problem, because a book with thirty highlights pushed the note off the
 * bottom instead.
 *
 * Every panel stays mounted and the others are hidden, so switching tabs does
 * not throw away a half-typed meaning or scroll an answer back to the top.
 */
export function SecondaryTabs({
  active,
  onChange,
  panels,
}: {
  active: SecondaryTab;
  onChange: (tab: SecondaryTab) => void;
  panels: Record<SecondaryTab, ReactNode>;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        aria-label="Panel"
        className="border-rule mb-4 flex shrink-0 border-b"
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
            className={`-mb-px min-h-10 flex-1 border-b-2 text-xs tracking-widest uppercase transition-colors duration-(--fast) ${
              active === tab.id
                ? "border-marker text-ink"
                : "hover:text-ink border-transparent text-ink-quiet"
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
          // Scrolls inside itself when it has more than fits. The AI panel
          // manages its own height and so never uses this; the saved things
          // grow without limit and always will.
          className="min-h-0 flex-1 space-y-4 overflow-y-auto"
          hidden={active !== tab.id}
          id={`panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
          // A hidden panel is not focusable, so the panel itself is the stop
          // that follows the tabs for anyone arriving by keyboard.
          tabIndex={active === tab.id ? 0 : -1}
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
