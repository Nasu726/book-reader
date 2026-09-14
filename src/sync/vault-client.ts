/**
 * The vault, as the browser sees it: three calls to this app's own origin.
 *
 * The Worker behind `/api/vault` holds the token and talks to GitHub; from
 * here the vault is a folder of named notes with versions. Swapping this file
 * for one that talks to GitHub directly is what a public build would do.
 */

export type VaultNote = { text: string; sha: string };
export type VaultEntry = { name: string; sha: string };

export class VaultUnavailableError extends Error {
  constructor(readonly status: number) {
    super(status === 503 ? "The vault is not set up." : "The vault could not be reached.");
    this.name = "VaultUnavailableError";
  }
}

const note = (name: string) => `/api/vault/notes/${encodeURIComponent(name)}`;

export async function listNotes(): Promise<VaultEntry[]> {
  const response = await fetch("/api/vault/notes");
  if (!response.ok) throw new VaultUnavailableError(response.status);
  return ((await response.json()) as { notes: VaultEntry[] }).notes;
}

export async function getNote(name: string): Promise<VaultNote | null> {
  const response = await fetch(note(name));
  if (response.status === 404) return null;
  if (!response.ok) throw new VaultUnavailableError(response.status);
  return (await response.json()) as VaultNote;
}

/** Writes over version `sha`, or creates the note when there is none. */
export async function putNote(
  name: string,
  text: string,
  sha: string | undefined,
  message: string,
): Promise<{ sha: string } | "conflict"> {
  const response = await fetch(note(name), {
    body: JSON.stringify({ message, sha, text }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  if (response.status === 409) return "conflict";
  if (!response.ok) throw new VaultUnavailableError(response.status);
  return (await response.json()) as { sha: string };
}
