# book-reader

A mobile-first web reader for PDF and EPUB documents that keeps what you mark and write in your own Obsidian vault. Questions and translation are left to the tools that already do them well (Claude, ChatGPT, DeepL); the reader makes the passage easy to take there. See `docs/DECISIONS.md` D-52 for the turn away from built-in AI and a server-side database, and `docs/WORKMAP.md` for where the rewrite stands.

## How it works

- Files are opened from the device and kept in the browser (IndexedDB). A document's id is the SHA-256 of the file, so the same file is the same document everywhere.
- Marks and notes are kept on the device and rendered into one Markdown note per document, which a small Cloudflare Worker writes into a GitHub repository — your vault — on your behalf. The Worker holds the token; the browser never does.
- The app is a static PWA served by that Worker, behind Cloudflare Access.

## Requirements

- Node.js 24+
- npm

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run verify
```

runs lint, typecheck, the unit tests, the Playwright suites (desktop Chromium and an iPhone 17 layout project), and the production build. `npm run test:e2e` starts its own development server on port 3100; every test gets a fresh browser context, so there is nothing to isolate or tear down.

## Deployment

`npx wrangler deploy` builds and publishes the Worker with the static assets. The Access policy, the vault repository, and the token are set up by hand: see `docs/HUMAN-TASKS.md`. `npm run check:access` confirms the deployment is behind Access and its audience tag matches.

## Current boundaries

- Real-device iPhone Safari acceptance remains outstanding (HUMAN-001).
- The vault sync and the Worker are the next stages of the rewrite (PIVOT-004 onwards in `docs/WORKMAP.md`).
