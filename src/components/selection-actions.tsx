"use client";

import type { DocumentSelection } from "@/core/selection/capture";

export type SelectionAction = "explain" | "translate" | "simplify" | "highlight";

const LABELS: Record<SelectionAction, string> = {
  explain: "Explain",
  translate: "Translate",
  simplify: "Simplify",
  highlight: "Highlight",
};

type Placement = { left: number; top: number; below: boolean };

const MENU_HEIGHT = 52;
const GAP = 8;

/**
 * Where to put the menu, from the live selection rectangle.
 *
 * Read from the DOM rather than carried on DocumentSelection: that envelope is
 * persisted and sent to the model, and screen coordinates belong to neither.
 */
function measurePlacement(selection: DocumentSelection | null): Placement | null {
  if (!selection || typeof window === "undefined") return null;

  const live = window.getSelection();
  const range = live && live.rangeCount > 0 ? live.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;

  const below = rect.top < MENU_HEIGHT + GAP;
  return {
    left: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
    top: below ? rect.bottom + GAP : rect.top - GAP,
    below,
  };
}

/**
 * The actions, offered where the reader is already looking.
 *
 * They existed only in the pane beside the text, which is why "how do I add a
 * highlight" was a fair question: nothing near the passage said it was
 * possible. A control that appears against the selection answers that without a
 * manual.
 *
 * Positioned above the selection, or below it when there is no room. Never over
 * it: on iOS the native selection handles sit at both ends of the range, and
 * covering them takes away the reader's ability to adjust what they picked
 * (SPEC SEL-004).
 */
export function SelectionActions({
  selection,
  onAction,
}: {
  selection: DocumentSelection | null;
  onAction: (action: SelectionAction) => void;
}) {
  // Measured during render rather than in an effect. The position comes from
  // the live DOM selection, which is settled by the time this renders, and
  // copying it into state only to render it again is the cascading update the
  // effect rules warn about.
  const placement = measurePlacement(selection);

  if (!selection || !placement) return null;

  return (
    <div
      aria-label="Actions for the selected text"
      className="fixed z-40 flex -translate-x-1/2 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      role="group"
      style={{
        left: placement.left,
        top: placement.top,
        transform: placement.below
          ? "translate(-50%, 0)"
          : "translate(-50%, -100%)",
      }}
    >
      {(Object.keys(LABELS) as SelectionAction[]).map((action) => (
        <button
          className="min-h-11 rounded-lg px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          key={action}
          // The menu must not steal the selection it is acting on.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
          type="button"
        >
          {LABELS[action]}
        </button>
      ))}
    </div>
  );
}
