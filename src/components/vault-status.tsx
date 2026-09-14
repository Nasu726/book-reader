import { useState } from "react";

import { flush, useSyncRuns, useSyncStatus } from "@/sync/sync";

function describe(status: ReturnType<typeof useSyncStatus>): string {
  switch (status.state) {
    case "syncing": return "Syncing with your vault…";
    case "synced": return `Synced with your vault at ${new Date(status.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    case "waiting": return status.reason;
    case "unavailable": return status.reason;
    default: return "Changes go to your vault shortly after you make them.";
  }
}

/**
 * Where the notes stand with the vault, and a way to not wait.
 *
 * The sync is quiet by design; this is the one place it speaks, so a reader
 * who has just marked something on a train knows it is kept here and will
 * go when the connection does.
 */
export function VaultStatus({ documentId }: { documentId: string }) {
  const status = useSyncStatus();
  const runs = useSyncRuns();
  const [busy, setBusy] = useState(false);

  return (
    <div className="border-rule flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <p aria-live="polite" className="text-ink-quiet min-w-0 flex-1 text-xs" data-sync-run={runs} data-sync-state={status.state}>
        {describe(status)}
      </p>
      <button
        className="text-ink-quiet hover:text-ink min-h-9 shrink-0 text-xs tracking-wide uppercase transition-colors duration-(--fast) disabled:opacity-50"
        disabled={busy || status.state === "syncing"}
        onClick={async () => {
          setBusy(true);
          try {
            await flush({ include: documentId });
          } finally {
            setBusy(false);
          }
        }}
        type="button"
      >
        Sync now
      </button>
    </div>
  );
}
