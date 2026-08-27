"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ReaderControls } from "./reader-controls";

type AppShellProps = {
  /** Shown at the left of the top bar: where you are, and how to get back. */
  title?: ReactNode;
  reader: ReactNode;
  secondary?: ReactNode;
  /** Sign-out control, supplied by the server because only it knows how. */
  account?: ReactNode;
  /** Text size only appears where reflowing the text does something. */
  showTextSize?: boolean;
  /**
   * Increment to open the sheet from outside — used when an action chosen at
   * the selection will put its answer in there.
   */
  openSecondarySignal?: number;
};

/**
 * The frame every screen sits in: a fixed top bar, then the reading surface,
 * with the AI and notes pane beside it on a wide screen and behind a button on
 * a narrow one.
 *
 * Two rules hold this together, and both were learned the hard way.
 *
 * The whole app is exactly one viewport tall and the two panes scroll
 * independently inside it. When the shell was only height-constrained at the
 * widest breakpoint, everything below that width scrolled as one page and any
 * `flex-1` inside the AI pane resolved against zero free space — the answer box
 * collapsed to nothing and its text printed over the controls underneath.
 *
 * The second pane appears from `lg`, not `xl`. At `xl` a 1280-pixel window —
 * an ordinary laptop, or a scaled display — dropped to the phone layout and
 * hid the AI pane behind a drawer, which is not what a desktop reader is for.
 */
export function AppShell({
  title,
  reader,
  secondary,
  account,
  showTextSize,
  openSecondarySignal = 0,
}: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastSignal, setLastSignal] = useState(0);

  if (openSecondarySignal !== lastSignal) {
    setLastSignal(openSecondarySignal);
    if (openSecondarySignal > 0) setSheetOpen(true);
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
        <div className="min-w-0 flex-1">{title}</div>
        <ReaderControls showTextSize={showTextSize} />
        {account}
      </header>

      {/*
        Edge to edge on a phone, framed on a wide screen. A PDF page is only as
        readable as it is wide, and on a 390-pixel screen the shell's padding
        was taking a tenth of that away from the page itself.
      */}
      <div className="flex min-h-0 flex-1 gap-4 sm:p-4 lg:px-6">
        <main
          aria-label="Reader"
          className="min-w-0 flex-1 overflow-y-auto bg-white shadow-sm sm:rounded-2xl sm:border sm:border-zinc-200 sm:p-5 dark:bg-zinc-950 sm:dark:border-zinc-800"
          data-reader-scroll
        >
          {reader}
        </main>

        {secondary && !sheetOpen && (
          <button
            className="fixed right-4 bottom-4 z-30 min-h-12 rounded-full bg-zinc-900 px-5 font-medium text-white shadow-lg lg:hidden dark:bg-zinc-100 dark:text-zinc-900"
            onClick={() => setSheetOpen(true)}
            type="button"
          >
            Ask AI
          </button>
        )}

        {/* Dims the page behind the sheet and closes it when tapped. */}
        {secondary && sheetOpen && (
          <button
            aria-label="Close the AI panel"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setSheetOpen(false)}
            type="button"
          />
        )}

        {/*
          One instance in two shapes: a column beside the text on a wide screen,
          a sheet that rises from the bottom edge on a phone. It is always
          mounted and moved with a transform, both so the movement can be
          animated and because rendering the panel a second time duplicated
          every element id — which pointed each label at the other copy's input
          — and remounting it threw away the answers already on screen.

          The sheet stops short of the top so the passage being asked about
          stays visible. Covering the whole screen ends the reading.
        */}
        {secondary && (
        <aside
          aria-label={sheetOpen ? "AI drawer" : "AI and notes"}
          aria-modal={sheetOpen || undefined}
          className={[
            "flex flex-col bg-white dark:bg-zinc-950",
            // Phone: a sheet parked below the edge until it is asked for.
            "fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] rounded-t-2xl p-4 shadow-2xl",
            "transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none",
            // Parked off-screen is not the same as absent: an element that is
            // merely translated away still answers to a screen reader and to a
            // test asking whether the pane is showing.
            sheetOpen ? "translate-y-0 visible" : "invisible translate-y-full",
            // Wide screen: an ordinary column, no transform, always present.
            "lg:visible lg:static lg:z-auto lg:max-h-none lg:w-[380px] lg:shrink-0 lg:translate-y-0",
            "lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-zinc-200 lg:p-5",
            "lg:shadow-sm lg:transition-none lg:dark:border-zinc-800",
          ].join(" ")}
          role={sheetOpen ? "dialog" : undefined}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between lg:hidden">
            <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <button
              className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
              onClick={() => setSheetOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-visible">
            {secondary}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
