"use client";

import { useCallback } from "react";

import { HIGHLIGHT_COLORS, type HighlightColor } from "@/core/highlights/colors";
import type { DocumentSelection } from "@/core/selection/capture";

/** Highlighting is handled separately: it needs a colour, not just a verb. */
export type SelectionAction = "explain" | "translate" | "simplify";

const LABELS: Record<SelectionAction, string> = {
  explain: "Explain",
  translate: "Translate",
  simplify: "Simplify",
};

/** The swatch itself, so a colour is picked by looking rather than by reading. */
const SWATCHES: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-emerald-300",
  blue: "bg-blue-300",
  pink: "bg-pink-300",
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
    left: rect.left + rect.width / 2,
    top: below ? rect.bottom + GAP : rect.top - GAP,
    below,
  };
}

/**
 * Pulls the menu back on screen once its real width is known.
 *
 * The horizontal position was clamped against a guessed half-width, and the
 * guess stopped being true the moment the menu grew a row of colours: on a
 * phone it hung off the left edge with the actions unreachable. A ref callback
 * runs with the element in hand, so the width is measured rather than assumed.
 *
 * Written straight to the node instead of into state. The alternative is to
 * render, measure, store, and render again, which is the cascading update the
 * placement above was written to avoid.
 */
function useEdgeAwarePlacement(left: number) {
  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const half = node.offsetWidth / 2;
    const room = window.innerWidth - GAP - half;
    // A menu wider than the screen has no position that fits; centring it at
    // least keeps the overflow even, and max-width keeps it from happening.
    node.style.left = `${room < GAP + half ? window.innerWidth / 2 : Math.min(Math.max(left, GAP + half), room)}px`;
  }, [left]);
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
  onHighlight,
}: {
  selection: DocumentSelection | null;
  onAction: (action: SelectionAction) => void;
  onHighlight: (color: HighlightColor) => void;
}) {
  // Measured during render rather than in an effect. The position comes from
  // the live DOM selection, which is settled by the time this renders, and
  // copying it into state only to render it again is the cascading update the
  // effect rules warn about.
  const placement = measurePlacement(selection);
  const keepOnScreen = useEdgeAwarePlacement(placement?.left ?? 0);

  if (!selection || !placement) return null;

  return (
    <div
      aria-label="Actions for the selected text"
      className="fixed z-40 flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      ref={keepOnScreen}
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
      {/* Four colours instead of one Highlight button: choosing the colour is
          the same single tap as highlighting, so nothing is asked of a reader
          who does not care which one it is. */}
      <span aria-hidden className="mx-1 w-px self-stretch bg-zinc-200 dark:bg-zinc-700" />
      <span aria-label="Highlight" className="flex items-center gap-1 pr-1" role="group">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            aria-label={`Highlight in ${color}`}
            className={`h-7 w-7 rounded-full border border-black/15 dark:border-white/25 ${SWATCHES[color]}`}
            key={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onHighlight(color)}
            type="button"
          />
        ))}
      </span>
    </div>
  );
}
