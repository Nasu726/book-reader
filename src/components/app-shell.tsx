"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ReaderControls } from "./reader-controls";

type AppShellProps = {
  reader: ReactNode;
  secondary?: ReactNode;
};

export function AppShell({
  reader,
  secondary,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeControl = (
    <button
      className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white"
      onClick={() => setMobileOpen(false)}
      type="button"
    >
      Back to Reader
    </button>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:h-dvh xl:max-h-dvh">
      <section
        aria-label="Reader"
        className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        {reader}
        <ReaderControls />
      </section>
      {!mobileOpen && (
        <button
          className="fixed right-4 bottom-4 z-30 min-h-12 rounded-full bg-zinc-900 px-5 font-medium text-white shadow-lg xl:hidden"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          AI
        </button>
      )}
      <aside
        aria-label="AI and notes"
        className="hidden w-[360px] shrink-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:block"
      >
        {secondary ?? <p className="text-sm text-zinc-600 dark:text-zinc-400">AI actions and notes will appear here.</p>}
      </aside>
      {mobileOpen && (
        <div
          aria-label="AI drawer"
          className="fixed inset-0 z-40 flex flex-col bg-white p-4 dark:bg-zinc-950 xl:hidden"
          role="dialog"
        >
          <div className="mb-4 flex justify-end">{closeControl}</div>
          <div aria-label="AI answer" className="min-h-0 flex-1 overflow-y-auto">
            {secondary}
          </div>
        </div>
      )}
    </div>
  );
}
