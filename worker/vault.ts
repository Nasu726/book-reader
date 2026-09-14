/**
 * The vault proxy: the reader's notes, in a GitHub repository, by way of a
 * token only this Worker holds.
 *
 * Three operations — list the notes, read one, write one — over the GitHub
 * contents API, with the paths pinned to one folder and one file type. The
 * browser never sees the token, GitHub's own error bodies, or anything
 * outside the folder. A memory store stands in for GitHub in development
 * and in the tests, so the routes are exercised without a network.
 */

export type VaultEnv = {
  VAULT_REPO?: string;
  VAULT_DIR?: string;
  VAULT_TOKEN?: string;
  /** "memory" keeps notes in this process; anything else means GitHub. */
  VAULT_STORE?: string;
};

export type NoteEntry = { name: string; sha: string };
export type NoteFile = { text: string; sha: string };

export type VaultStore = {
  get(path: string): Promise<NoteFile | null>;
  /** `sha` is the version being replaced; absent for a new file. */
  put(path: string, text: string, sha: string | undefined, message: string): Promise<{ sha: string } | "conflict">;
  list(dir: string): Promise<NoteEntry[]>;
};

/** A note is one Markdown file in the folder: no path, no other type. */
export function noteNameIsSafe(name: string): boolean {
  return name.length <= 200
    && name.endsWith(".md")
    && name.length > 3
    // Control characters are rejected one by one: a regex class of them is
    // the thing the lint rule exists to flag.
    && ![...name].some((char) => char === "/" || char === "\\" || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
    && !name.startsWith(".")
    && name.trim() === name;
}

const MAX_NOTE_BYTES = 1_000_000;

// ------------------------------------------------------------- memory store

async function contentSha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createMemoryStore(): VaultStore {
  const files = new Map<string, NoteFile>();
  let writes = 0;
  return {
    async get(path) {
      return files.get(path) ?? null;
    },
    async put(path, text, sha) {
      const current = files.get(path);
      if (current ? current.sha !== sha : sha !== undefined) return "conflict";
      // Salted with the write count so the same text written twice is two
      // versions, the way two commits of the same content are.
      writes += 1;
      const next = { sha: await contentSha(`${writes}:${text}`), text };
      files.set(path, next);
      return { sha: next.sha };
    },
    async list(dir) {
      const prefix = `${dir}/`;
      return [...files.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        .map(([path, file]) => ({ name: path.slice(prefix.length), sha: file.sha }));
    },
  };
}

// ------------------------------------------------------------- GitHub store

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`GitHub answered ${status}.`);
    this.name = "UpstreamError";
  }
}

export function createGithubStore(options: { repo: string; token: string; fetch?: typeof fetch }): VaultStore {
  const call = options.fetch ?? fetch;
  const base = `https://api.github.com/repos/${options.repo}/contents/`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "user-agent": "book-reader",
    "x-github-api-version": "2022-11-28",
  };
  const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

  return {
    async get(path) {
      const response = await call(`${base}${encodePath(path)}`, { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new UpstreamError(response.status);
      const payload = (await response.json()) as { content?: string; sha?: string };
      if (typeof payload.content !== "string" || typeof payload.sha !== "string") throw new UpstreamError(502);
      return { sha: payload.sha, text: fromBase64(payload.content) };
    },
    async put(path, text, sha, message) {
      const response = await call(`${base}${encodePath(path)}`, {
        body: JSON.stringify({ content: toBase64(text), message, ...(sha ? { sha } : {}) }),
        headers: { ...headers, "content-type": "application/json" },
        method: "PUT",
      });
      // 409: the sha is stale. 422: no sha for a file that exists. Both mean
      // someone else wrote first.
      if (response.status === 409 || response.status === 422) return "conflict";
      if (!response.ok) throw new UpstreamError(response.status);
      const payload = (await response.json()) as { content?: { sha?: string } };
      if (typeof payload.content?.sha !== "string") throw new UpstreamError(502);
      return { sha: payload.content.sha };
    },
    async list(dir) {
      const response = await call(`${base}${encodePath(dir)}`, { headers });
      if (response.status === 404) return [];
      if (!response.ok) throw new UpstreamError(response.status);
      const payload = (await response.json()) as { name?: string; sha?: string; type?: string }[];
      if (!Array.isArray(payload)) throw new UpstreamError(502);
      return payload
        .filter((entry) => entry.type === "file" && typeof entry.name === "string" && typeof entry.sha === "string" && entry.name.endsWith(".md"))
        .map((entry) => ({ name: entry.name!, sha: entry.sha! }));
    },
  };
}

export function storeFor(env: VaultEnv, memory: () => VaultStore): VaultStore | null {
  if (env.VAULT_STORE === "memory") return memory();
  if (!env.VAULT_REPO || !env.VAULT_TOKEN) return null;
  return createGithubStore({ repo: env.VAULT_REPO, token: env.VAULT_TOKEN });
}

// -------------------------------------------------------------------- routes

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Serves `/api/vault/*`. The caller has already been through Access; this
 * only decides what the request may touch.
 */
export async function handleVault(request: Request, env: VaultEnv, store: VaultStore): Promise<Response> {
  const dir = (env.VAULT_DIR || "Reading").replace(/^\/+|\/+$/g, "");
  const url = new URL(request.url);
  const match = /^\/api\/vault\/notes(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return json({ error: "Not found." }, 404);

  try {
    if (match[1] === undefined) {
      if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
      return json({ notes: await store.list(dir) });
    }

    let name: string;
    try {
      name = decodeURIComponent(match[1]);
    } catch {
      return json({ error: "Bad note name." }, 400);
    }
    if (!noteNameIsSafe(name)) return json({ error: "Bad note name." }, 400);
    const path = `${dir}/${name}`;

    if (request.method === "GET") {
      const file = await store.get(path);
      return file ? json(file) : json({ error: "Not found." }, 404);
    }
    if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);

    let body: { text?: unknown; sha?: unknown; message?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Bad request." }, 400);
    }
    if (typeof body.text !== "string" || (body.sha !== undefined && typeof body.sha !== "string")) {
      return json({ error: "Bad request." }, 400);
    }
    if (new TextEncoder().encode(body.text).byteLength > MAX_NOTE_BYTES) return json({ error: "Too large." }, 413);
    const message = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 200) : `reader: ${name}`;

    const written = await store.put(path, body.text, body.sha, message);
    if (written === "conflict") return json({ error: "The note changed in the vault; read it again." }, 409);
    return json({ sha: written.sha }, body.sha ? 200 : 201);
  } catch (cause) {
    // The status only. GitHub's body can name the token, the repository, or
    // the reason the token was refused; none of that belongs in a browser.
    const status = cause instanceof UpstreamError ? cause.status : 500;
    return json({ error: "The vault could not be reached." }, status === 500 ? 500 : 502);
  }
}
