"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

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
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ from: number; at: number; time: number } | null>(null);

  if (openSecondarySignal !== lastSignal) {
    setLastSignal(openSecondarySignal);
    if (openSecondarySignal > 0) setSheetOpen(true);
  }

  // Escape closes it, because a swipe is not something every reader can make
  // and the grip is not something every reader can see.
  useEffect(() => {
    if (!sheetOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sheetOpen]);

  /**
   * Drags the sheet down with the finger, and lets go of it.
   *
   * The grip at the top of the sheet is the promise every phone makes: this
   * thing can be pushed back down. Keeping a Close button next to it said the
   * promise was false, and the reader had to aim at a word instead of flicking
   * a sheet away.
   *
   * The movement is written straight to the node rather than kept in state. A
   * finger produces a position every frame, and rendering the whole panel at
   * that rate is how a drag stops feeling attached to the finger.
   */
  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const sheet = sheetRef.current;
    // Only the sheet. On a wide screen this is a column and goes nowhere.
    if (!sheet || window.matchMedia("(min-width: 64rem)").matches) return;
    dragRef.current = { at: event.clientY, from: event.clientY, time: event.timeStamp };
    sheet.style.transition = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const moveDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet) return;
    drag.at = event.clientY;
    drag.time = event.timeStamp;
    // Downwards only: dragging up would lift the sheet off the bottom edge.
    sheet.style.transform = `translateY(${Math.max(0, event.clientY - drag.from)}px)`;
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    dragRef.current = null;
    if (!drag || !sheet) return;
    sheet.style.transition = "";
    sheet.style.transform = "";

    const travelled = event.clientY - drag.from;
    const elapsed = Math.max(1, event.timeStamp - drag.time);
    // Far enough, or fast enough. A flick is over before it has gone far.
    if (travelled > 88 || (event.clientY - drag.at) / elapsed > 0.4) setSheetOpen(false);
  }, []);

  return (
    <div className="bg-paper text-ink flex h-dvh flex-col">
      <header className="border-rule flex shrink-0 items-center gap-3 border-b px-(--gutter) py-3">
        <div className="min-w-0 flex-1">{title}</div>
        <ReaderControls showTextSize={showTextSize} />
        {/* One entry point, in the one header every screen shares. The manual
            answers what nothing on screen can: what a highlight is for, why the
            text size control only appears on some books, and what an EPUB is. */}
        <Link
          className="text-ink-quiet hover:text-ink flex min-h-11 shrink-0 items-center text-xs tracking-wide uppercase transition-colors duration-(--fast)"
          href="/help"
        >
          Help
        </Link>
        {account}
      </header>

      {/* The sheet and its margin, divided by one line. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            Where a reader puts its own controls, outside the pane that
            scrolls. A toolbar inside it was pinned vertically and nothing
            else, so zooming a page past the width of the screen slid the page
            number off to the left along with the rest of the book.
          */}
          <div className="border-rule empty:hidden shrink-0 border-b" data-reader-toolbar />
          <main
            aria-label="Reader"
            className="min-w-0 flex-1 overflow-y-auto px-(--gutter) py-(--gutter)"
            data-reader-scroll
          >
            {reader}
          </main>
        </div>

        {secondary && !sheetOpen && (
          <button
            className="bg-ink text-paper right-(--gutter) bottom-(--gutter) fixed z-30 min-h-12 rounded-full px-5 text-xs tracking-widest uppercase shadow-lg transition-transform duration-(--fast) ease-(--ease) active:scale-95 lg:hidden"
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
            className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px] transition-opacity duration-(--slow) lg:hidden"
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
          ref={sheetRef}
          className={[
            "bg-paper flex flex-col",
            // Phone: a sheet parked below the edge until it is asked for.
            "fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] rounded-t-2xl p-(--gutter) shadow-2xl",
            "transition-[transform,visibility] duration-(--slow) ease-(--ease) motion-reduce:transition-none",
            // Parked off-screen is not the same as absent: an element that is
            // merely translated away still answers to a screen reader and to a
            // test asking whether the pane is showing.
            sheetOpen ? "translate-y-0 visible" : "invisible translate-y-full",
            // Wide screen: an ordinary column, no transform, always present.
            "lg:visible lg:static lg:z-auto lg:max-h-none lg:w-[380px] lg:shrink-0 lg:translate-y-0",
            // The pane itself never scrolls. What has more than fits — the
            // transcript, the list of saved things — scrolls inside its own
            // box, so the controls stay put and the whole column does not
            // creep up and down by a few pixels while reading.
            //
            // On a wide screen it is the margin of the page: one hairline, no
            // card, no shadow, no second border inside the first.
            "lg:border-rule lg:overflow-hidden lg:rounded-none lg:border-l lg:p-(--gutter)",
            "lg:shadow-none lg:transition-none",
          ].join(" ")}
          role={sheetOpen ? "dialog" : undefined}
        >
          {/* The grip, and the whole of it is the handle: a target the width of
              the sheet is easier to catch than the line drawn inside it.
              touch-action keeps the browser from claiming the drag as a scroll. */}
          <div
            className="-mt-1 flex shrink-0 touch-none justify-center pt-1 pb-3 lg:hidden"
            onPointerCancel={endDrag}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            <span aria-hidden className="bg-rule h-1 w-10 rounded-full" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {secondary}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
