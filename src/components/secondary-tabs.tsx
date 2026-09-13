"use client";

import { useRef, type ReactNode } from "react";

export type SecondaryTab = "highlights" | "notes";

const TABS: { id: SecondaryTab; label: string }[] = [
  { id: "highlights", label: "Marks" },
  { id: "notes", label: "Notes" },
];

/**
 * Splits the pane beside the text into two things that are not each other:
 * what the reader marked, and what the reader wrote. Stacked in one column, a
 * book with thirty highlights pushed the note off the bottom.
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
          // Scrolls inside itself when it has more than fits: the saved things
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
