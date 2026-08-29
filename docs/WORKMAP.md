# AI Reader 開発作業マップ

**Version:** 1.1  
**文書種別:** Living Execution Map  
**目的:** Codex / Ox Alphaが大きな指示を待たず、自律的に「次に実行可能な小さな作業」を選べるようにする。

---

## 0. この文書の使い方

エージェントはリポジトリ直下の `AGENTS.md` を最初に読み、その指示に従ってこの作業マップを更新する。

### Status

- `TODO`: 未着手
- `READY`: 依存解決済みで着手可能
- `IN_PROGRESS`: 現在作業中
- `BLOCKED`: 外部要因または未解決依存あり
- `VERIFY`: 実装済みだが検証待ち
- `DONE`: 完了条件と検証を満たした
- `HUMAN`: 実機操作や秘密情報等、人間の作業が必要

### Taskの基本サイクル

```text
Task選択
→ 対象コード調査
→ 必要なら短い実装計画
→ 実装
→ lint/typecheck/tests/build
→ 差分レビュー
→ 修正
→ WORKMAP更新
→ commit可能ならcommit
→ 次のREADY Task
```

1 Taskを巨大化させない。概ね「1つの明確な成果 + その検証」で閉じる。

---

# 1. Dependency graph

```text
BOOT-001
 ├─ BOOT-002
 ├─ ARCH-001
 │   ├─ DB-001 ─ DB-002
 │   ├─ AI-001 ─ AI-002 ─ AI-003
 │   └─ PARSE-001
 │        ├─ EPUB-001 ─ EPUB-002
 │        └─ PDF-001 ─ PDF-002
 │
 ├─ AUTH-001
 ├─ UI-001
 │   ├─ UI-002
 │   └─ UI-003
 │
 └─ TEST-001

DB-002 + EPUB-002 + PDF-002 + UI-002
 └─ READ-001 ─ READ-002 ─ SEL-001 ─ HILITE-001

AI-003 + SEL-001
 └─ AIACT-001 ─ CTX-001 ─ CONV-001 ─ AIACT-002
     │
     └─ DESK-001 ─ NOTE-001

READ-002 + AIACT-002 + AUTH-001
 └─ E2E-001

E2E-001
 ├─ PWA-001
 ├─ QA-CHROME-001
 └─ QA-SAFARI-001 (実機はHUMANになる場合あり)

MVP core:
E2E-001 + PWA-001 + QA-CHROME-001 + QA-SAFARI-001 + security checks

Post-MVP / P1:
PDF-003, DESK-001, NOTE-001, PAPER-001, LANG-001, VOC-001
```

---

# 2. Foundation

## BOOT-001 — Repository reconnaissance
**Status:** DONE
**Priority:** P0
**Depends on:** none

### Goal

既存リポジトリの状態を把握し、破壊的な初期化を避ける。

### Actions

- tree /主要ファイル確認
- package manager確認
- framework / versions確認
- existing tests / lint / CI確認
- existing env handling確認
- Git status / branch確認
- 既存コードがあれば設計意図を読む
- `AGENTS.md`, `docs/PLAN.md`, `docs/SPEC.md`, 本文書の整合確認

### Done when

- 既存構成を壊さず次のTaskに進める
- 必要な前提がWORKMAPのExecution Logに記録されている
- 空repoならBOOT-002をREADYにする

---

## BOOT-002 — Application scaffold
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-001

### Goal

Next.js + TypeScript + Tailwindを中心とした実行可能なWebアプリ基盤を作る。

### Deliverables

- app boots locally
- package scripts
- lockfile
- base TypeScript config
- base styling
- `.env.example`
- `.gitignore`

### Verify

- clean install
- lint
- typecheck
- production build

---

## ARCH-001 — Architecture boundaries
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-001

### Goal

実装前に最低限の境界をコード構造へ反映する。

### Required boundaries

- UI / Reader
- document parsing
- data access / repository
- AI service / provider
- context builder
- auth

### Done when

- ディレクトリ / module境界が存在する
- Provider固有コードがUIに入らない
- DB固有コードがUIに入らない
- parserがUIから交換可能な境界を持つ

過剰なClean Architecture化はしない。

---

## TEST-001 — Test harness
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-002

### Goal

Unit / integration / E2Eを増やせる基盤を用意する。

### Verify

- sample unit test passes
- browser E2E runner can boot app
- CIまたは同等の一括verification commandがある

---

# 3. Dependency / security baseline

## DEP-001 — Dependency review workflow
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-001

### Goal

PDF / EPUB / auth等で外部依存を選ぶ前の判断ルールを実運用できる形にする。

### Actions

新規大規模依存候補について:

- license
- maintenance
- current compatibility
- known vulnerabilities
- recent supply-chain incident reports
- package popularity / ecosystem support

を確認する。

### Done when

- 選定理由をPR/commitまたはExecution Logに短く残せる
- 不要な自作を避ける方針が守られる

---

# 4. Data

## DB-001 — DB / repository selection
**Status:** DONE
**Priority:** P0
**Depends on:** ARCH-001

### Goal

初期SQLite実装とRepository境界を確定する。

### Required entities

- documents
- document_sections
- reading_progress
- highlights
- conversations
- messages

notes / vocabularyは将来追加可能であること。

### Verify

- migration / schema initialization works
- DB choice documented in WORKMAP log

---

## DB-002 — Document repository
**Status:** DONE
**Priority:** P0
**Depends on:** DB-001

### Goal

Document metadataとsection locationを保存 / 取得できるRepository APIを作る。

### Verify

- CRUD operations tested
- orphan cleanup behavior defined for delete path
- no direct DB access from UI

---

# 5. Parsing

## PARSE-001 — Parser boundaries
**Status:** DONE
**Priority:** P0
**Depends on:** ARCH-001

### Goal

PDF / EPUB parserをUIとReader表示から分離した共通境界として定義する。

### Required capabilities

- import validation
- metadata extraction
- logical section extraction
- stable location representation
- failure isolation

### Verify

- parser interface tests pass
- invalid file does not crash application boundary

---

## EPUB-001 — EPUB parser selection and import
**Status:** DONE
**Priority:** P0
**Depends on:** PARSE-001, DEP-001

### Goal

EPUB importとmetadata / section抽出を実装する。

### Verify

- sample EPUB import succeeds
- malformed EPUB returns safe error
- section order is stable

---

## EPUB-002 — EPUB reader representation
**Status:** DONE
**Priority:** P0
**Depends on:** EPUB-001

### Goal

章移動と再オープン可能なlocation表現を持つReader data modelを作る。

### Verify

- chapter navigation works
- reload restores position using stable internal location
- font size changes preserve reading intent as far as practical

---

## PDF-001 — PDF renderer and text layer
**Status:** DONE
**Priority:** P0
**Depends on:** PARSE-001, DEP-001

### Goal

PDF表示とtext layerを実装する。表示と抽出処理は分離する。

### Verify

- sample PDF renders in Chrome
- page navigation works
- text selection produces normalized candidate string
- renderer failure does not corrupt extraction pipeline
- canvas and text layer share one display scale
- pdf.js text layer stylesheet is loaded, so text runs are positioned
- `tests/e2e/pdf.spec.ts` asserts the two geometries agree

---

## PDF-002 — PDF extraction normalization
**Status:** DONE
**Priority:** P1  
**Depends on:** PDF-001

### Goal

改行、hyphenation、段組を考慮してAI context向けテキストを正規化する。

### Verify

- single column sample improves line joins
- two-column sample has deterministic extraction order or explicit limitation
- failure remains isolated from rendering

Evidence: PDF.js text items are converted to a separate coordinate-aware extraction pipeline. Single-column lines join deterministically, two-column content is emitted left column before right column, missing coordinates return empty output, and rendering failures remain isolated. Existing PDF Chromium journeys continue to pass.

---

## PDF-003 — Paper structure inference
**Status:** DONE
**Priority:** P1  
**Depends on:** PDF-002, PAPER-001

### Goal

論文的構造を可能な範囲で推定し、context builderへ渡す。

### Rule

推定失敗時にfallback textのみでReaderとAI requestを成立させる。

Evidence: Inference runs only during PDF selection capture, falls back to `undefined` on extraction errors or empty page text, and leaves the AI request valid with selection/document/surrounding context. Unit coverage proves safe inference fallbacks, structure propagation outside persisted locations, matching-section prompt provenance, and missing-section omission.

---

# 6. Authentication

## AUTH-001 — Single-user authentication
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-002

### Goal

単一ユーザー向け安全なlogin / logoutを作る。

### Requirements

- password hashing
- HttpOnly session cookie
- production Secure cookie
- protected routes / APIs
- rate limiting or equivalent basic protection

### Verify

- login required for app content
- logout invalidates session
- password not stored plaintext
- auth failure does not leak detailed user existence information

---

# 7. AI architecture

## AI-001 — Provider abstraction
**Status:** DONE
**Priority:** P0
**Depends on:** ARCH-001

### Goal

Provider / Modelを設定可能にする抽象層を作る。

### Requirements

- provider adapter interface
- model setting separated from provider setting
- timeout / cancellation handling
- normalized errors
- mock provider implementation

### Verify

- unit tests cover success and failure paths
- provider-specific types do not leak into application services
- secrets remain server-side only

---

## AI-002 — OpenRouter adapter
**Status:** DONE
**Priority:** P0
**Depends on:** AI-001, DEP-001

### Goal

OpenRouter互換API adapterを作る。Ox Alpha固有条件を抽象層へ持ち込まない。

### Verify

- live smoke test script exists separately from normal tests
- normal tests use mock provider
- credential absence skips only live test
- server-side key handling verified

---

## AI-003 — Explain / Translate / Simplify / Ask service
**Status:** DONE
**Priority:** P0
**Depends on:** AI-001

### Goal

4つのAI actionを共通service経由で提供する。

### Requirements

- prompt templates centralized
- selected text and surrounding context input
- language settings extensible
- response streaming optional
- failures isolated from Reader

### Verify

- each action uses mock provider successfully
- prompt construction covered by unit tests
- provider failure returns actionable UI-safe error

---

# 8. UI foundation

## UI-001 — App shell and responsive layout
**Status:** DONE
**Priority:** P0
**Depends on:** BOOT-002

### Goal

モバイル1ペイン / デスクトップ2ペイン候補となるshellを作る。

### Verify

- narrow viewport keeps Reader primary
- wide viewport can host secondary pane without breaking Reader width
- dark mode toggle available

---

## UI-002 — Library and import UI
**Status:** DONE
**Priority:** P0
**Depends on:** DB-002, UI-001

### Goal

文書一覧とimport画面を作る。

### Verify

- PDF / EPUB upload accepted
- rejected files show reason
- library shows title, type, author, last opened, progress
- empty state is useful

---

## UI-003 — Theme / typography controls
**Status:** DONE
**Priority:** P0
**Depends on**: UI-001

### Goal

ライト / ダーク切替とEPUB文字サイズ調整を提供する。

### Verify

- preference persists
- contrast meets accessibility baseline
- mobile controls remain usable

---

# 9. Reading experience

## READ-001 — Document open route
**Status:** DONE
**Priority:** P0
**Depends on:** DB-002, EPUB-002, PDF-001, UI-002

### Goal

Libraryから文書を開き、正しいReaderへ遷移する。

### Verify

- PDF / EPUB both open
- unsupported or broken file shows safe error
- opening updates last opened timestamp

---

## READ-002 — Navigation and progress persistence
**Status:** DONE
**Priority:** P0
**Depends on:** READ-001

### Goal

PDF page / EPUB location移動を保存し復元する。

### Verify

- navigation persists after reload
- drawer / sheet open-close does not reset position
- save failure is visible and retryable if practical

---

## SEL-001 — Text selection capture
**Status:** DONE
**Priority:** P0
**Depends on:** READ-002

### Goal

Reader内選択を安定した内部表現として取得する。

### Verify

- EPUB selection captures text and stable range
- PDF selection captures text and page / geometry source
- focus movement during menu interaction preserves captured selection
- EPUB captures section ID plus canonical section-text offsets
- PDF captures page number plus normalized selected text
- selection envelopes are validated before reuse

---

## HILITE-001 — Highlight persistence
**Status:** DONE
**Priority:** P0
**Depends on:** SEL-001

### Goal

Highlight保存・復元・削除を実装する。

### Verify

- highlight survives reload
- highlight maps correctly after rotation / reflow where supported
- deletion cleans up persisted record

---

# 10. AI experience

## AIACT-001 — Selection action menu
**Status:** DONE
**Priority:** P0
**Depends on:** SEL-001

### Goal

Explain / Translate / Simplify / Ask / Highlightへ到達できるselection menuを作る。

### Verify

- native iOS selection handles are usable
- menu opens without losing selection intent
- keyboard does not trap focus
- long selected text remains operable

Evidence: Chromium core journeys exercise selection and every action without losing intent; responsive mobile/desktop layouts remain usable. Native iPhone selection-handle, keyboard, and long-text behavior remain explicitly under `QA-SAFARI-001` / `HUMAN-001`.

---

## CTX-001 — Context builder
**Status:** DONE
**Priority:** P0
**Depends on:** PARSE-001, DB-002

### Goal

選択範囲前後、章 / page、文書metadataから適切なcontextを構築する。

### Requirements

- token budget management
- deterministic trimming
- source provenance retained where possible
- PDF extraction failure isolated

### Verify

- budget trimming covered by unit tests
- context includes selection and surrounding source
- oversized context degrades predictably

Evidence: Reader selections now capture document title plus bounded surrounding text for EPUB sections and PDF pages; the AI panel propagates that context through `runAiAction`. Stable selection locations remain unchanged, while unit coverage asserts EPUB/PDF surrounding-context extraction.

---

## CONV-001 — Conversation storage
**Status:** DONE
**Priority:** P0
**Depends on:** DB-002, AI-003

### Goal

会話とmessageをdocument context付きで保存する。

### Verify

- conversation history loads
- selected text / location preserved
- failed assistant message leaves recoverable state

Evidence: document-scoped conversations are owner-resolved, successful assistant responses persist selected text and location, and repository behavior is covered by unit tests.

---

## AIACT-002 — AI answer presentation
**Status:** DONE
**Priority:** P0
**Depends on:** AIACT-001, AI-003, CONV-001

### Goal

回答表示、loading / error / retry、継続質問を作る。

### Verify

- mobile bottom sheet or drawer handles long responses
- desktop can use side pane
- closing AI view restores Reader scroll position
- error allows retry and continued reading

---

# 11. QA

## QA-CHROME-001 — Chrome automated QA
**Status:** DONE
**Priority:** P0
**Depends on:** E2E-001

### Goal

最新Chrome系ブラウザで主要フローを自動確認する。

### Verify

- login, import, read, select, explain, restore position flow passes
- responsive layouts checked
- console critical errors absent

Evidence: Chromium core journeys cover the full PDF and EPUB flows; dedicated desktop/mobile checks assert Reader-first responsive behavior; a Chrome QA test records zero browser console errors and page errors.

---

## QA-SAFARI-001 — Safari automated QA
**Status:** HUMAN
**Priority:** P0
**Depends on:** E2E-001

### Goal

Safari互換性の自動検証部分を確認する。

### Human boundary

実iPhoneでしか確認できない項目は `HUMAN` として明示し、未確認をDONE扱いしない。

重点:

- long press / text handles
- selection action UI
- scroll
- keyboard
- viewport
- PWA standalone
- back navigation

Automated readiness: WebKit project and `E2E_PROJECTS=webkit` override are configured. On 2026-08-26, Playwright downloaded WebKit 26.5 successfully to a writable browser cache, but launch failed because the host lacks GTK/GStreamer multimedia libraries. Installing those system packages requires host package administration.

Human/host command:

```bash
sudo npx playwright install-deps webkit
DATABASE_PATH=/tmp/book-reader-e2e-webkit.db E2E_PROJECTS=webkit npm run test:e2e
```

Human verification required on real iPhone Safari:

- long press / native text handles select PDF and EPUB content
- selection action UI opens without losing reading position or keyboard usability
- scroll and back navigation preserve document state
- standalone PWA launches from the home screen with correct viewport

---

## PWA-001 — Installable application shell
**Status:** DONE
**Priority:** P0
**Depends on:** UI-003

### Goal

Provide the required installable web app configuration while preserving normal browser access.

### Verify

- valid web manifest is linked
- standalone display and start URL are declared
- 192px and 512px PNG icons resolve
- theme color is present

Evidence: `public/manifest.webmanifest`, generated icons, and Chromium E2E metadata/icon checks.

---

# 12. End-to-end MVP

## E2E-001 — Core user journey
**Status:** DONE
**Priority:** P0
**Depends on:** AUTH-001, READ-002, HILITE-001, AIACT-002, TEST-001

### Goal

MVPの中心フローを自動 / 手動で通す。

```text
Login
→ Import PDF/EPUB
→ Open
→ Read
→ Select
→ Explain
→ Translate
→ Simplify
→ Ask
→ Highlight
→ Reload
→ Position / data restored
```

### Done when

- automated checks available for stable portions
- external AI is mockable
- optional live smoke test separate
- failures do not corrupt state

Evidence: Chromium core journeys cover login, PDF and EPUB import/open/read/select, all four AI actions, highlight persistence, reload restoration of highlight data and EPUB position; AI is isolated behind the mock provider in Playwright.

---

# 13. Desktop / Paper / Language extensions

## DESK-001 — Desktop two-pane UX
**Status:** DONE
**Priority:** P1  
**Depends on:** AIACT-002, UI-003

### Goal

Chrome等の広い画面で左Reader / 右AI・操作領域を提供する。

### Verify

- responsive collapse
- Reader width remains readable
- right pane independently scrollable as appropriate

Evidence: Chromium tests verify the desktop secondary pane and independent Reader/notes scrolling at constrained viewport height; mobile continues to use the drawer, while existing responsive QA covers collapse and Reader primacy.

---

## NOTE-001 — Document notes
**Status:** DONE
**Priority:** P1  
**Depends on:** DESK-001, DB-002

### Goal

右ペインに文書メモを提供する。

### Verify

- autosave or explicit save
- reload persistence
- save failure visible

Evidence: Notes use an owner-scoped document-level SQLite upsert repository, authenticated GET/POST APIs, explicit save with visible success/failure and retry, and Chromium coverage for reload restoration. Repository tests also prove cross-owner writes cannot replace another user's note.

---

## PAPER-001 — Paper structure extraction
**Status:** DONE
**Priority:** P1  
**Depends on:** PDF-002, CTX-001

### Goal

Title / Authors / Abstract / major sectionsを可能な範囲で構造化する。

### Rule

heuristic failureで通常Readerを壊さない。

Evidence: PDF page extraction feeds a deterministic paper heuristic that detects title/authors, abstract, and seven major section headings. Inference is isolated from rendering with a safe empty fallback; inferred structure stays outside persisted selection locations. AI prompts include paper title, abstract, and only the section containing the selection.

---

## LANG-001 — Configurable translation languages
**Status:** DONE
**Priority:** P1  
**Depends on:** AIACT-002

### Goal

Translateのsource / target languageを内部的に可変にし、UIから設定可能にする。

### Verify

英語→日本語以外のpairを少なくともテストする。

Evidence: Translation input now carries an explicit auto source language and a UI-selected target language. Prompt construction remains centralized in the action service, with unit coverage for `auto → Portuguese` and Chromium coverage that the Translate action remains available in the reader journey.

---

## VOC-001 — Vocabulary
**Status:** DONE
**Priority:** P1  
**Depends on:** LANG-001, DB-002, SEL-001

### Goal

選択した語 / phraseを出典付きで保存する。

### Rule

英単語専用のschemaにしない。

Evidence: The vocabulary schema stores arbitrary terms and phrases with meaning, source text, versioned selection location, document provenance, timestamps, and owner scoping. Repository coverage uses a French phrase; Chromium coverage saves a selected PDF source, restores it after reload, and deletes securely through an owner-scoped API.

---

# 14. Production hardening

## PROD-001 — Deployment storage decision
**Status:** DONE
**Priority:** P0 before production
**Depends on:** E2E-001

### Goal

実際のdeploy targetに対してSQLite永続化が妥当か判断する。

### Decision

- persistent SQLite volume
- managed PostgreSQL
- other

のいずれかを根拠付きで選ぶ。

ユーザーがdeploy targetをまだ指定していない場合は、コードを特定環境にロックせず他の非依存Taskを継続する。

### Decision

- Immediate stable dogfooding: a Node.js host with a persistent SQLite volume, running the existing `next build && next start` flow.
- Document bytes live on disk behind the `DocumentStorage` boundary (`DOCUMENT_STORAGE_DIR`, default `./data/documents`), not inside SQLite. The database holds only an opaque reference, so the store can be swapped for object storage without touching repositories, routes, or the UI. Documents imported before this change are still readable: references beginning with `data:` are decoded in place.
- `npm run db:backup` covers the database only. The document directory must be backed up alongside it.
- GitHub Pages is rejected because authenticated dynamic APIs, uploads, SQLite, cookies, and server-side AI proxying are required.
- Cloudflare Pages static export is rejected for the same reason.
- A strict free-tier Cloudflare path requires Workers + D1 + R2 and a storage-layer refactor; defer it unless the user explicitly wants that migration.

---

## PROD-CF-001 — Cloudflare deployment target
**Status:** IN_PROGRESS
**Priority:** P0 before production
**Depends on:** PROD-001

### Decision

2026-08-27: ユーザーがdeploy先をCloudflareに指定。Workers + D1 + R2、無料枠の範囲で運用する。PROD-001で「ユーザーが明示的に望むまで保留」としたstorage層移行を実施する。

### 一次情報で確認した無料枠制約

| 項目 | Workers Free |
|---|---|
| CPU時間 | 10ms / invocation |
| Workerバンドル | 3 MiB (gzip後) |
| リクエスト | 100,000 / 日 |
| メモリ | 128 MB |
| D1 | 5 GB、読み 5,000,000行/日、書き 100,000行/日 |
| R2 | 10 GB、egress無料、Class A 1,000,000/月、Class B 10,000,000/月 |

Next.js 16は `@opennextjs/cloudflare` が対応済み。`node:crypto` は `nodejs_compat` で全API利用可能（argon2、ed448、x448、DSA/DHのgenerateKeyPairを除く）。したがってscrypt認証は移行不要。

### 移行が必要な箇所

- `better-sqlite3` はネイティブaddonでWorkersでは動かない → D1 (`drizzle-orm/d1`)
- `session-store.ts` が同期SQLite APIを直接使用 → D1は非同期なので認証経路を非同期化
- filesystem `DocumentStorage` → R2 adapter（境界は実装済みなので差し替えのみ）
- EPUBのサーバ側パース → ブラウザへ移す。10ms CPUで書籍1冊のパースは成立しない。同時にlinkedomとepub-tsがWorkerバンドルから外れ3 MiB制約も緩和される

### Done when

- Workers上で認証、import、PDF表示、EPUB表示、AI action、highlight、note、vocabulary、progressが動作する
- 文書のbyte列がR2にあり、メタデータがD1にある
- 無料枠の制約内で主要フローが完了する
- ローカル開発（better-sqlite3 + filesystem）も引き続き動作する

### Subtasks

- PROD-CF-002 — EPUBパースをブラウザへ移す — **DONE**
- PROD-CF-003 — Cloudflare Access認証（scryptの51〜79ms CPUを排除）— **DONE**
- PROD-CF-004 — R2 document storage adapter — **DONE**
- PROD-CF-005 — D1 repositories — **DONE**
- PROD-CF-006 — OpenNext adapter、wrangler設定、deploy — **DONE**

### 実測値

| 項目 | 無料枠 | 実測 |
|---|---|---|
| Workerバンドル | 3 MiB (gzip) | **1.33 MiB** |
| Access JWT検証 | CPU 10ms | **1.25 ms**（中央値） |
| scrypt検証（参考・不採用） | CPU 10ms | 51〜79 ms |

SSRのCPU実測はデプロイ後に取る。

### デプロイ状況

最終デプロイ: 2026-08-29、main の `021c9ff` から（Version `00c9fee9`）。

- URL: https://book-reader.nasu.uk（`https://book-reader.e9gp1ant-1729.workers.dev` も同じWorker）
- Cloudflare Access で Worker 単位に保護済み。未認証は Access のログインへ302され、アプリまで到達しない。`/help` も同様にAccessの内側にある（アプリ自身は認証を要求しないが、エッジで保護される）
- `npm run check:access` — audience 一致を確認済み
- D1 のスキーマは `0003` まで remote へ適用済み（`usage_counters`、`highlights.color`）
- デプロイはローカルの wrangler から実行した。**GitHub Actions からの自動デプロイは `docs/HUMAN-TASKS.md` の H-9 待ち**（Cloudflare の APIトークンが必要）
- E2E のスマホ用プロジェクトは iPhone 17 の実寸・dpr3。**実 WebKit で走らせるには `docs/HUMAN-TASKS.md` の H-10**（システムライブラリの導入、sudo が必要）
- 残り: 本人による本番動作確認。Access のポリシーが1アドレスのみ許可のため、エージェントはサインインできない

人間側の待ち行列は `docs/HUMAN-TASKS.md` を参照。

---

## PROD-002 — Backup / export
**Status:** DONE
**Priority:** P1 before production  
**Depends on:** PROD-001

### Goal

個人データを失わない最低限のbackup / export方法を用意する。

### Verify

- `npm run db:backup -- <file>` creates a complete SQLite snapshot through the online backup API.
- `npm run db:restore -- <file> --replace` validates integrity and schema presence before replacing `DATABASE_PATH`.
- Restore removes stale WAL/SHM files and instructs migration before startup.
- Regression coverage preserves source usability during online backup and validates restored data.

---

## SEC-REVIEW-001 — Secret / auth review
**Status:** DONE
**Priority:** P0 before production
**Depends on:** AUTH-001, AI-002, E2E-001

### Verify

- no tracked secrets
- no client-exposed AI key
- protected AI endpoints
- upload validation
- dependency audit
- production cookie settings
- logs do not leak sensitive values

Evidence:

- tracked files contain only `.env.example` key names; no credential or private-key material found
- OpenRouter credentials are read only by the server provider factory; no `NEXT_PUBLIC` or client-side secret references exist
- all document APIs authenticate and scope reads to the owner; progress writes now require an owned parent document
- uploads enforce EPUB/PDF MIME, 1 byte–100 MB limits, opaque database storage, and parser isolation without filesystem paths
- login uses scrypt, rate limiting, random server-side sessions, HttpOnly cookies, and Secure cookies in production
- production browser source maps remain disabled; runtime logging contains only non-sensitive migration/error summaries
- production dependency audit reports zero vulnerabilities

---

# 15. Human acceptance

## QUALITY-001 — Reader defects found on handover
**Status:** DONE
**Priority:** P0
**Depends on:** E2E-001

### Goal

引き継ぎ時に実機起動で発見された、自動検証を素通りしていた欠陥を修正する。

### Findings

すべて lint / typecheck / unit / E2E / build が緑の状態で存在していた。

- PDFのtext layerがcanvasと別スケールで配置され、さらにpdf.jsのtext layer CSSが未読込だった。本文が二重に見え、選択位置が一致しない
- ライブラリ画面が`PdfRenderer`のdefault propに埋め込まれたサンプルPDFを表示していた
- EPUB本文を`documentElement.textContent`で平坦化し、`<head><title>`混入と段落境界の消失が起きていた
- EPUBのメタデータtitle / creatorを取得済みなのに破棄し、常にファイル名を採用していた
- login画面の入力欄に可視ラベルが無かった
- `auth_sessions.user_id`がUNIQUEで、端末を1台しか維持できなかった。logoutは全端末を破棄していた
- AIパネルがsidebarとmobile drawerで二重描画され、全element idが重複していた
- OpenRouterアダプタがHTTP 429をretryable判定していなかった
- 全routeが毎リクエストでSQLite接続を開き直しmigrationを再実行していた
- uploadのformat判定がclient申告のMIMEのみだった
- `pdf.spec.ts` / `ai-answer.spec.ts`の全assertionが`if (await locator.isVisible())`の内側にあり、対象が消えると何も検証せず緑になった

### Done when

- 上記すべてが修正されている
- 各修正に、その欠陥が再発したとき赤くなる自動テストがある
- text layer幾何とowner scopingはmutation testで検出を確認済み

---

## SAFE-001 — 無料枠を超える書き込みの拒否
**Status:** DONE
**Priority:** P1
**Depends on:** PROD-CF-001

### Goal

誤操作・暴走・攻撃のいずれでも、D1無料枠（1日10万行）を使い切らないようにする。超過時は原因不明の500ではなく、意味のあるメッセージを返す。

### Verify

- `tests/unit/write-budget.test.mts` — 上限到達・人ごとの独立・UTC日での復帰・数えられないときの通過
- `tests/unit/write-budget-coverage.test.mts` — 書き込みroute全件が `chargeWrite` を呼ぶ
- mutation: guard を1箇所外すと coverage テストが赤、上限を off-by-one にすると budget テストが赤

判断理由は `docs/DECISIONS.md` D-19。

---

## HILITE-002 — ハイライトの着色と色選択
**Status:** DONE
**Priority:** P1
**Depends on:** HILITE-001

### Goal

保存したハイライトを本文に描く。色は4色から選ぶ。

### Verify

- `tests/unit/find-range.test.mts` — EPUBのオフセット解決（同じ語が2回出る本文を含む）、PDFの正規化検索（行またぎ・行末ハイフン）
- `tests/e2e/highlight-colors.spec.ts` — 選択→着色、再読み込み後の再描画、EPUBのオフセット経路、未知の色の400、`::highlight` 規則がブラウザに届いていること
- mutation: 描画呼び出しの削除・色検証の削除・境界解決の削除でそれぞれ赤

判断理由は `docs/DECISIONS.md` D-20。

---

## HELP-001 — 操作マニュアル
**Status:** DONE
**Priority:** P1
**Depends on:** QUALITY-001

### Goal

「ハイライトの付け方が分からん」「saved highlights とは何か」「Dark の横の % が何なのか」「EPUBというものを知らないのでテスト不可能」に、画面内で答える。

### Verify

- `tests/e2e/help.spec.ts` — 未サインインで開けること、ヘッダの `Help` から到達できること
- mutation: ヘッダのリンク削除・`/help` 削除でそれぞれ赤

判断理由は `docs/DECISIONS.md` D-21。

---

## DESK-002 — 右パネルのタブ分割
**Status:** DONE
**Priority:** P1
**Depends on:** DESK-001

### Goal

AIとのやりとりと、読者が保存したもの（ハイライト・ノート・単語帳）を別のタブにする。別の機能なので混ぜない。

### Verify

- `tests/e2e/secondary-tabs.spec.ts` — 切り替え、書きかけのノートの保持、矢印キーがページを送らずタブを移ること、選択メニューからのAI操作でAIタブが前に出ること
- mutation: `stopPropagation` の削除で矢印キーのテストが赤、`hidden` の削除で分離のテストが赤

判断理由は `docs/DECISIONS.md` D-22。

---

## CONV-002 — AIパネルを1本の会話にする
**Status:** DONE
**Priority:** P0
**Depends on:** CONV-001, AIACT-002

### Goal

Explain / Translate / Simplify / 質問を、1本の会話として上から下へ流す。会話の話題をアプリ側で保持し、選択が消えても操作できるようにする。保存する履歴を人間が読める内容にする。

### 実機で見つかった欠陥

- **本文のどこかをクリックすると全アクションが無効になった**。有効・無効をブラウザの選択状態に直結させていたため。段落を説明させたあと訳させるには選択し直すしかなかった
- **会話履歴に組み立て済みプロンプトが保存されていた**。開き直すと過去のプロンプトが全部モデルの発言として表示された
- `Ask` アクションと `Follow-up question` 入力欄が同じことをしていた
- 右ペイン全体がスクロールし、回答が伸びると操作ボタンごと動いた

### Verify

- `tests/e2e/conversation.spec.ts` — 選択を失っても話題が残ること、開き直した会話がプロンプトを含まないこと、会話を消せること（サーバに問い合わせて確認）、回答をノートへ保存できること
- `tests/e2e/ai-answer.spec.ts` — ペインは `hidden`、会話ログは `auto`
- mutation: 話題を live selection に戻す／プロンプトを保存し直す／DELETEを無効化する、でそれぞれ赤

判断理由は `docs/DECISIONS.md` D-23、D-24。

---

## PDFSEL-001 — PDFのテキスト選択が扱いにくい
**Status:** TODO
**Priority:** P2
**Depends on:** READ-005

### 問題

実利用で「PDFは文字選択のUXが悪く、気持ち悪い」との報告。表示・ハイライト・AIへの受け渡しは動くが、**選択操作そのもの**が快適でない。

### なぜそうなるか（PDF側の性質）

pdf.js の text layer は、本文をなぞれるようにするための**透明なspanの集まり**で、各spanは元のPDFの描画命令1つぶんに対応する。したがって:

- **spanの並び順は読む順序とは限らない**。PDFのcontent streamの順序であり、2段組や図表混じりでは行をまたぐ選択が離れた場所の文字を巻き込む
- **spanの矩形は文字の見た目とずれる**。1つのspanが1行まるごとを覆うため、行間でドラッグすると何も選べない／選びすぎる
- **語や段落の構造が無い**。ダブルクリックの語選択やトリプルクリックの段落選択が効きにくい
- 行末のハイフン分割や、字送り調整で1語が複数spanに割れることがある

つまりHTMLの本文をなぞる感覚とは原理的に別物で、EPUBでは起きない。

### 検討できる方向

1. 抽出済みテキスト（`extractPdfText` が持つ読み順）に対する**独自の選択レイヤー**を作り、行の矩形にスナップさせる
2. 行単位・段落単位のタップ選択を用意し、ドラッグに頼らない
3. pdf.js の text layer 生成オプションを見直す

いずれも小さくないので、他が落ち着いてから着手する。**EPUBでは問題が出ない**ため、語学用途は先にEPUBへ寄せるのも手。

---

## DESIGN-001 — デザイントークンと版面の規約
**Status:** DONE
**Priority:** P0
**Depends on:** DESK-002

### Goal

色・余白・動き・書体をトークン1箇所に集約し、UIはそれだけを使う。余白は `clamp()` の割合指定にする。

### Verify

- `npm run verify`
- `tests/e2e/auth.spec.ts` — テーマ切り替えが実際に紙の色を塗り替えること（body で測る）
- 1440 / 402px の目視

判断理由は `docs/DECISIONS.md` D-25。

---

## CONV-003 — 送信は入力欄だけ。アクションはコマンド
**Status:** DONE
**Priority:** P0
**Depends on:** CONV-002

### Goal

`/explain` 等をボタンで入力欄に書き込み、送信は1箇所に集約する。選択の所有者を本文に戻す。

### Verify

- `tests/unit/command-parsing.test.mts` — コマンド解釈
- `tests/e2e/conversation.spec.ts` — 本文で選択を解けばパネルも未選択になり、パネル操作では外れないこと
- `tests/e2e/document-open.spec.ts` — 未選択でもアクションは押せ、送信だけが止まり、理由が出ること

判断理由は `docs/DECISIONS.md` D-26。

---

## PDFMEM-001 — 読み終えたページのcanvasを解放する
**Status:** DONE
**Priority:** P0
**Depends on:** READ-005

### 問題

実機（iPhone 17）でPDFが描画されず、Try againも効かないとの報告。

### 原因

一度描いたcanvasを**一度も解放していなかった**。dpr3のiPhoneでは1ページあたり 1206×1706 ≈ 8MB。iOS Safari はページが保持できるcanvas総量に上限があり、超えると割り当てを拒否する。長いPDFを読み進めるほど確実に到達する。

### Verify

- `tests/e2e/mobile.spec.ts` — 12ページのPDFを末尾までスクロールし、先頭ページのcanvasが 0 px になり、読んでいるページは描かれたままであること
- mutation: 解放を外すと 1,881,360 px が残って赤

描画タスクのキャンセル漏れ（再描画時の二重描画で例外）も同時に修正。

---

## MOBILE-001 — シートをスワイプで閉じる
**Status:** DONE
**Priority:** P1
**Depends on:** DESIGN-001

### Goal

上端のグリップを下へドラッグしてシートを閉じられるようにし、Close ボタンを削除する。

### Verify

- `tests/e2e/mobile.spec.ts` — 十分なスワイプで閉じること、ゆっくりした小さな引きでは閉じないこと
- mutation: しきい値を無効化すると前者が赤、`travelled > 0` にすると後者が赤
- Escape と背景タップでも閉じられる（スワイプできない読者のため）

判断理由は `docs/DECISIONS.md` D-27。

---

## PDFRANGE-001 — PDFを範囲取得にする
**Status:** DONE
**Priority:** P0
**Depends on:** PDFMEM-001

### 問題

iPhone で大きなPDFが開けず「無限リトライ」になる。PCでは正常。

### 原因

`fetch` → `arrayBuffer()` でファイル全体を1つのバッファに載せてから pdf.js へ渡していた。iOS はメモリ不足でタブを再読み込みするため、外からは読み込みが終わらないように見える。

### Verify

- `tests/e2e/pdf.spec.ts` — 260KBのPDFで 206 が返り、範囲で受け取るバイト数がファイルの半分未満
- mutation: `accept-ranges` を外すと 200 のみになって赤

判断理由は `docs/DECISIONS.md` D-28。

---

## A11Y-001 — 操作の境界とダークテーマのコントラスト
**Status:** DONE
**Priority:** P0
**Depends on:** DESIGN-001

### 問題

「ダークモードの視認性が悪い」「入力欄やボタンの範囲が分かりづらい」。実測すると枠線は **1.26:1 / 1.29:1** で、事実上見えていなかった。

### Verify

- `tests/unit/palette-contrast.test.mts` — 本文 7:1、副次テキスト 4.5:1、操作の縁 3:1、マーカー上の文字 4.5:1、ダークの2宣言の一致
- mutation: `--edge` を元の値に戻すと赤

判断理由は `docs/DECISIONS.md` D-30。

---

## CTX-002 — 質問を「開いているページ」で接地する
**Status:** DONE
**Priority:** P0
**Depends on:** CTX-001, CONV-003

### 問題

選択なしで質問すると、モデルへ届くのはタイトルだけだった。実際に「ドキュメントが提示されていないので貼ってください」と返ってきた。

### 解決

選択が無いときだけ、現在のページ（EPUBは章）の本文を最大4,000文字だけ context に載せる。選択があるときは `surroundingText` が既にあるので載せない。

### Verify

- `tests/unit/ai-action-service.test.mts` — 接地されること、選択時は二重に載らないこと、上限で切られること

判断理由は `docs/DECISIONS.md` D-31。

---

## DESK-003 — 右パネルを3タブにする
**Status:** DONE
**Priority:** P1
**Depends on:** DESK-002

### Goal

`AI` / `Notes` / `Marks`。ハイライトが増えるとノートと単語帳が画面外へ押し出される問題を解く。

### Verify

- `tests/e2e/secondary-tabs.spec.ts` — 3つが互いに独立して表示・非表示になること、矢印キーで巡回すること

判断理由は `docs/DECISIONS.md` D-32。

---

## MOBILE-002 — 入力時のページ拡大を止める
**Status:** DONE
**Priority:** P0
**Depends on:** DESIGN-001

### 問題

iOS Safari は16px未満のフィールドにフォーカスするとページを拡大し、戻さない。

### Verify

- `tests/e2e/mobile.spec.ts` — 表示中のフィールドすべての計算後 font-size が16px以上

判断理由は `docs/DECISIONS.md` D-33。

---

## PDFRANGE-002 — 範囲取得の退路と、失敗の可視化
**Status:** DONE
**Priority:** P0
**Depends on:** PDFRANGE-001

### 問題

1ページのPDFでもiPhoneで描画に失敗し、Try againも効かないとの報告。メモリでも取得量でも説明がつかない。

### 解決

範囲取得に失敗したら全体取得で開き直す。ページ描画の例外は握り潰さず、**メッセージを画面に出す**。実機からしか得られない情報を持ち帰れるようにするため。

### 残っていること

原因は未特定。実機のエラーメッセージ待ち。`docs/HUMAN-TASKS.md` H-10（WebKit の E2E）が入れば、この種の不具合を手元で再現できる。

判断理由は `docs/DECISIONS.md` D-34。

---

## PDFWORKER-001 — iPhoneでPDFの本文が読めない
**Status:** DONE
**Priority:** P0
**Depends on:** PDFRANGE-002

### 報告

iPhone で Try again の上に:

```
While reading the text: undefined is not a function (near '...t of e...')
getTextContent@.../chunks/51fb665c-....js:45:101561
```

### 原因

**Safari は `ReadableStream` の非同期イテレーションを実装していない。**

pdf.js はページの本文をこう集める（`legacy/build/pdf.mjs` 22166行）:

```js
for await (const value of readableStream) { … }   // getTextContent
```

Chrome と Firefox は何年も前に実装しているが、WebKit は未実装のまま。`Symbol.asyncIterator` が存在しないので `for await` がそれを呼ぼうとして落ちる。ページの取得も描画も成功したあとで失敗するため、症状は「描画できない」に見えていた。

**ページ数もファイルサイズも無関係**で、1ページのPDFでも必ず起きる。メモリや取得方法をいくら直しても消えなかったのはこのため。

### 解決

`src/components/stream-async-iterator.ts` が、機能が無いときだけ `ReadableStream.prototype[Symbol.asyncIterator]` を実装する。回避ではなく**欠けている標準機能の実装**として置く。

### Verify

- `tests/unit/stream-async-iterator.test.mts` — 機能を消した環境で `for await` が落ちること、入れれば通ること、途中で抜けてもストリームがロックされたままにならないこと、既にある環境では何も置き換えないこと
- `tests/unit/pdf-worker.test.mts` — 配信するworkerがパッケージ同梱のものと同一で、メイン側も legacy build を使っていること

### 途中で分かった別の問題（同時に修正）

`public/pdf.worker.min.mjs` が手でコピーしてcommitされた1.3MBのファイルで、インストール済みパッケージと一致する保証が無かった。ずれれば今回とよく似た症状になる。ビルド時のコピーに変え、テストで守る（D-35）。

判断理由は `docs/DECISIONS.md` D-35、D-36、D-37。

---

## PDFZOOM-001 — 拡大時の挙動
**Status:** DONE
**Priority:** P0
**Depends on:** PDFWORKER-001

### 報告

- ツールバーがヘッダから離れている
- **拡大時の横スクロールが致命的**
- 左上を起点に拡大するのが不自然。内容は中央列にある
- 拡大するとページ番号の挙動が怪しくなる

### 原因

すべて「拡大するとペインが横にもスクロールする」ことに起因していた。

- `sticky top-0` は縦にしか効かないので、ツールバーが本と一緒に左へ流れた
- 起点が左上だったので、本文のある中央から離れた
- ページ判定が「少しでも見えている一番上」だったので、3倍のページが自分のごく一部しか見せないことで壊れた

### Verify

- `tests/e2e/mobile.spec.ts` — 中央から拡大すること、左右どちらの端にも到達できること、拡大しても中央のページを数えること
- `tests/e2e/pdf.spec.ts` — ツールバーがペインの外にあること（`PDF controls`）
- mutation: 中央寄せを外す／`align-items` で中央揃えにする、でそれぞれ赤

判断理由は `docs/DECISIONS.md` D-38〜D-40。

---

## HELP-002 — マニュアルの目次
**Status:** DONE
**Priority:** P2
**Depends on:** HELP-001

### Goal

引いて使えるようにする。見出しへのアンカー一覧と、上へ戻るリンク。

### Verify

- `tests/e2e/help.spec.ts` — 目次の各項目に行き先が実在すること、移動できること

判断理由は `docs/DECISIONS.md` D-41。

---

## HUMAN-001 — Real iPhone dogfooding
**Status:** HUMAN  
**Priority:** P0 before final v0.1 sign-off  
**Depends on:** QA-SAFARI-001 implementation readiness

ユーザーが実際に1〜2時間程度、読みたい本 / 論文を読む。

フィードバック候補:

- 「面面」
- 読書が途切れる
- selectionしづらい
- AI画面が邪魔
- 戻ると位置が飛ぶ
- 回答contextが不適切
- PDFで選択しづらい

エージェントはこのTaskを代行したと主張してはならない。

人間のフィードバックを受けたら、新しいP0/P1 Taskへ分解して本マップへ追加する。

---

# 16. Completion gates

## MVP Gate

- AUTH-001 DONE
- E2E-001 DONE
- PWA-001 DONE
- QA-CHROME-001 DONE
- QA-SAFARI-001 自動検証部分DONE、実機項目はHUMAN明示
- SEC-REVIEW-001 DONE
- `docs/SPEC.md` のMVP Acceptance Criteriaを確認
- known critical bugs = 0

## v0.1 Final Gate

MVP Gateに加え:

- HUMAN-001完了
- Human feedback由来のcritical issue解消
- README / setup instructions
- deployment / backup方針確定

---

# 17. Execution Log

エージェントはTask完了時、必要な場合のみ短く追記する。

形式:

2026-08-26 — Upload ownership hardening

- Result: Added owner-checked conditional source updates, upload failure cleanup, a library repository delete method, and request-size bounds for AI prompts/context/selection metadata. This closes a race where an authenticated upload could attach source bytes to another user's document after ownership checks.
- Verification: lint; typecheck; 71 unit tests including owner-scoped source update/delete regression; production Webpack build; `git diff --check`.
- Follow-up review: Replaced the duplicated logout cookie constant with the shared session-store export. No debug leftovers or secret-bearing values were found in runtime source.
- Follow-up hardening: Added a content-length precheck with 1 MB form overhead allowance so oversized uploads are rejected before buffering the full payload.

2026-08-26 — Production startup smoke

- Result: Verified the production build starts against an isolated SQLite path. Login returned 200, unauthenticated root redirected to login with 307, and the protected AI API returned 401.

2026-08-25 — Deployment packaging

- Result: Added a production Node container using Node.js 24, persistent `/data`, automatic migration at startup, non-root execution, and secret/local-database exclusion. Documented persistent-volume deployment requirements and commands.
- Verification: lint; typecheck; online backup/restore regressions; production Webpack build.

2026-08-25 — PROD-002

- Result: Added safe online SQLite backup and guarded restore commands with integrity/schema checks, stale WAL/SHM cleanup, README operational guidance, and focused regression coverage.
- Verification: typecheck; unit regressions for online backup data preservation, same-path rejection, missing-backup rejection, and validated restore.

2026-08-25 — Post-merge review hardening

- Result: Removed duplicate automatic EPUB highlight persistence; explicit Highlight remains the sole save path. Moved login attempt tracking to process-wide state so rate limiting survives request-scoped service construction. Added bounded persisted conversation history, restored AI history after reload, sent selection/location metadata to the API, and added an AI cancel control. Corrected PDF column detection with populated-side, crossing-item, line-count, and gutter checks. Document source updates now refresh `updatedAt`.
- Deployment decision: GitHub Pages is unsuitable; current Cloudflare static deployment is also unsuitable. Stable immediate path is Node hosting with persistent SQLite volume. Strict Cloudflare support would require D1/R2 migration.
- Verification: lint; typecheck; 67 unit tests; 20 Chromium E2E tests; production Webpack build; `git diff --check`.

```text
YYYY-MM-DD — TASK-ID
- Result:
- Verification:
- Important decision:
- Follow-up:
```

2026-08-22 — BOOT-001 / BOOT-002
- Result: Confirmed the merged scaffold and added `.env.example` for server-side AI configuration.
- Verification: lint, typecheck, unit tests, Playwright Chromium E2E, production build.
- Follow-up: Continue with DB-001 and DEP-001.

2026-08-22 — ARCH-001
- Result: Added minimal typed boundaries for AI provider, context builder, auth, parser, repository, and reader adapter.
- Verification: lint and typecheck.
- Important decision: Keep boundaries as interfaces/types only until concrete DB and provider tasks.

2026-08-22 — TEST-001
- Result: Added Node.js unit tests, Playwright Chromium E2E, and a combined `npm run verify` command.
- Verification: lint, typecheck, 1 unit test, 1 Chromium E2E test, production build.
- Important decision: Use Playwright Test as the proven browser E2E runner (Apache-2.0).

2026-08-22 — DEP-001 / DB-001
- Result: Selected SQLite via better-sqlite3 with Drizzle ORM schema definitions and a minimal migration function.
- Verification: lint, typecheck, unit tests, Chromium E2E, production build; `npm audit` reports no vulnerabilities.
- Important decision: Drizzle Kit was rejected because its current dependency chain includes vulnerable esbuild versions; use `tsx` for TypeScript execution instead.

2026-08-22 — DB-002
- Result: Implemented SQLite document metadata and ordered section repository APIs with regression tests for CRUD, section ordering/upserts, and cascade cleanup.
- Verification: lint, typecheck, 4 unit tests, Chromium E2E, production build.

2026-08-22 — PARSE-001
- Result: Added stable document location contracts, typed parse failures, format detection, and a parser registry that isolates parser errors from callers.
- Verification: lint, typecheck, 7 unit tests including invalid-file failure isolation, Chromium E2E, production build.
- Important decision: Keep the boundary dependency-free until EPUB-001 and PDF-001 select concrete parsers.

2026-08-22 — EPUB-001
- Result: Added a server-side EPUB parser using `@likecoin/epub-ts` with `linkedom`, extracting metadata, navigation titles, spine-ordered section text, and stable spine/CFI locations.
- Verification: lint, typecheck, 9 unit tests including valid sample import, stable section order, and malformed EPUB failure isolation, Chromium E2E, production build; `npm audit` reports no vulnerabilities.
- Important decision: `@likecoin/epub-ts` (BSD-2-Clause, actively maintained) was selected for its typed Node parser and single runtime dependency; `linkedom` supplies the documented server DOM parser.

2026-08-22 — EPUB-002
- Result: Added a versioned EPUB reader data model with first-open behavior, adjacent chapter navigation, reload-safe encoded locations, invalid-location rejection, and proportional character-offset preservation across font-size changes.
- Verification: lint, typecheck, 15 unit tests including navigation, restoration, boundary behavior, and font-size intent, Chromium E2E, production build.

2026-08-22 — AUTH-001
- Result: Added scrypt password hashing, SQLite-backed hashed session tokens, HttpOnly login/logout APIs with production Secure cookies, generic authentication errors, and per-client basic rate limiting.
- Result: Protected the application shell behind a server-side session check and added login and authenticated-reader browser flows.
- Verification: lint, typecheck, unit tests covering valid sessions, invalid credentials, logout invalidation, and rate limiting; Chromium E2E covering unauthenticated protection and login/logout API flow; production build.
- Important decision: Store only SHA-256 hashes of random session tokens; raw tokens remain exclusively in HttpOnly cookies.

2026-08-22 — AI-001
- Result: Extended the provider contract with provider/model configuration types, cancellation signals, timeout orchestration, normalized retryable/cancelled/provider errors, and a mock provider implementation.
- Verification: lint, typecheck, unit tests covering success, provider failure, timeout, and external cancellation, Chromium E2E, production build.
- Important decision: Keep provider-specific transport and credentials outside the core `AiProvider` boundary.

2026-08-22 — AI-003
- Result: Added a centralized Explain / Translate / Simplify / Ask action service with selection-first context construction, extensible language settings, empty-selection validation, and Reader-safe normalized failures.
- Verification: lint, typecheck, unit tests covering all four mock-provider actions, prompt construction, provider failure isolation, and empty selections; Chromium E2E; production build.

2026-08-22 — UI-001
- Result: Added a responsive authenticated app shell with a primary Reader pane on mobile and a secondary AI/notes pane on sufficiently wide viewports.
- Verification: lint, typecheck, unit tests, Chromium E2E covering narrow Reader primacy and wide secondary-pane availability.
- Follow-up: Re-run production build after resolving the local Turbopack CSS worker port restriction.

2026-08-22 — UI-003
- Result: Added persistent light/dark theme selection and bounded 80–180% reader font-size controls with mobile-friendly touch targets.
- Verification: lint, typecheck, unit preference key tests, Chromium E2E covering theme persistence, font-size persistence, narrow Reader primacy, and wide secondary-pane availability.
- Follow-up: Production build remains blocked by the local Turbopack CSS worker port restriction; TypeScript and browser runtime checks pass.

2026-08-22 — CTX-001
- Result: Extended context construction with document/section provenance, labeled before/after sources, deterministic token-budget trimming, selection/question priority, and invalid budget rejection.
- Verification: lint, typecheck, unit tests covering source provenance, oversized-context degradation, selection priority, invalid budgets, and existing behavior; Chromium E2E.

2026-08-22 — CONV-001
- Result: Added SQLite conversation/message persistence with selected-text and location fields, ordered history loading, and recoverable pending assistant messages that can be completed after a provider failure.
- Verification: lint, typecheck, unit tests covering selection/location preservation, pending assistant recovery, and ordered history; Chromium E2E.

2026-08-22 — AI-002
- Result: Added a server-only OpenRouter-compatible chat adapter with normalized request/response handling and a separate credential-gated live smoke script.
- Verification: lint, typecheck, unit tests using injected fetch for success and provider failures, mock-provider suites, Chromium E2E; live smoke skipped without credentials.

2026-08-22 — UI-002
- Result: Added an authenticated document API with PDF/EPUB MIME validation, filename fallback title, size limits, and no filesystem path use; added library import controls and a useful empty state.
- Verification: lint, typecheck, unit suites, Chromium E2E covering import visibility, useful empty state, authentication, responsive shell, and preference persistence.
- Important decision: Store metadata only in this task; raw file persistence is deferred until the document open route defines storage requirements.

2026-08-22 — AIACT-002
- Result: Added an authenticated server-side OpenRouter route, browser AI provider transport, desktop secondary pane, mobile Reader-preserving drawer, scrollable response history, retry, and follow-up questions.
- Verification: lint, typecheck, unit tests, Chromium E2E covering desktop pane and mobile drawer.
- Important decision: Keep the API key server-only and preserve the core action service as provider-independent.
- Follow-up: Production builds now use Next.js Webpack mode because Turbopack's PostCSS worker cannot bind its local worker port in the current sandbox; Google font fetching was removed in favor of system fonts.

2026-08-22 — PDF-001
- Result: Selected Mozilla `pdfjs-dist` 6.2.108 (Apache-2.0), added isolated canvas rendering and normalized page-text extraction, PDF page navigation, selectable text-layer preview, retryable renderer failure state, and Chromium coverage.
- Verification: lint, typecheck, unit tests, Chromium E2E covering rendered sample page, text layer, and bounded single-page navigation; production Webpack build; production dependency audit reports no vulnerabilities.
- Important decision: Use the proven PDF.js runtime rather than hand-writing a parser; renderer failures remain local to the PDF section and extraction returns normalized page strings without coupling to the visual pipeline.

2026-08-23 — READ-001
- Result: Added authenticated library links and document routes, stored-source retrieval, PDF opening through PDF.js, server-side EPUB parsing with section navigation, safe missing/broken document errors, automatic last-opened timestamps, and compatible database migrations.
- Verification: lint, typecheck, 35 unit tests, 11 Chromium E2E tests with an isolated authenticated database, production Webpack build.
- Important decision: Keep uploaded source bytes as opaque authenticated data URLs for MVP persistence while preserving parser boundaries; raw bytes are never exposed to unauthenticated requests.

2026-08-23 — READ-002
- Result: Added authenticated reading-progress APIs, SQLite upsert repository, versioned PDF page locations, versioned EPUB section locations, automatic save on navigation, reload restoration, and a visible retry path for EPUB save failure.
- Verification: lint, typecheck, 37 unit tests including progress upsert/read coverage, 12 Chromium E2E tests covering authentication, document routes, progress validation, PDF rendering, AI pane, responsive shell, and preferences.
- Follow-up: Add an authenticated stored multi-page PDF fixture for full browser navigation persistence before E2E-001.

2026-08-23 — SEL-001
- Result: Added versioned document-selection envelopes with validated locations. EPUB captures stable section IDs and canonical section-text offsets; PDF captures page plus normalized text intent.
- Verification: lint, typecheck, 44 unit tests including malformed-location rejection and stable EPUB offsets, 13 Chromium E2E tests, production Webpack build.
- Important decision: Store normalized selected text in the envelope so AI intent remains stable across focus changes; highlight restoration will use the same versioned location contract.

2026-08-23 — HILITE-001
- Result: Added an authenticated SQLite highlight repository, validated create/list/delete APIs, owner-scoped restoration, Reader-side EPUB selection persistence, saved-highlight list, and secure deletion.
- Verification: lint, typecheck, 45 unit tests including owner-scoped persistence/deletion, 15 Chromium E2E tests including reload-safe highlight persistence and cleanup, production Webpack build.
- Follow-up: PDF visual mapping and reflow-aware EPUB rendering remain part of reader polish; the current persisted intent is reload-stable and owner-scoped.

ログを詳細な日記にしない。恒久的な仕様変更は `SPEC.md`、方針変更は `PLAN.md` に反映する。

2026-08-24 — QA-CHROME-001
- Result: Added a dedicated Chromium console/page-error QA journey across desktop library and mobile reader layouts, with existing core-journey coverage for import, reading, selection, all AI actions, highlight restoration, and EPUB position restoration.
- Verification: lint, typecheck, 49 unit tests, 19 Chromium E2E tests including one transient network retry rerun, production Webpack build.

2026-08-24 — QA-SAFARI-001
- Result: Added a named Playwright WebKit project for automated Safari-engine compatibility and made E2E worker concurrency configurable.
- Blocker: WebKit could not launch in this sandbox because system dependencies require privileged package installation; no automated Safari result is claimed.
- Human boundary: Real iPhone Safari must confirm native selection behavior, action UI, scroll/keyboard/viewport behavior, PWA standalone launch, and back navigation before final MVP sign-off.

2026-08-24 — SEC-REVIEW-001
- Result: Completed secret, authentication, authorization, upload, cookie, logging, source-map, and dependency review; fixed progress saves so unowned documents cannot create or overwrite another user's row.
- Verification: lint, typecheck, 50 unit tests including cross-owner collision coverage, 19 Chromium E2E tests, production Webpack build, and production dependency audit with zero vulnerabilities.

2026-08-24 — PWA-001
- Result: Added a linked web manifest with standalone/start-url configuration, generated 192px and 512px icons, and a light theme-color declaration.
- Verification: lint, typecheck, 49 unit tests, 18 Chromium E2E tests including manifest/icon validation, production Webpack build.

2026-08-24 — E2E-001
- Result: Added provider selection with an explicit mock mode, document-scoped conversation persistence, owner-scoped progress lookup, reliable EPUB section restoration, debounced progress saves, connected PDF/EPUB highlight creation from the AI panel, PDF.js text-layer styling, and two core-journey browser tests.
- Verification: lint, typecheck, 49 unit tests, 17 Chromium E2E tests, production Webpack build.
- Important decision: Keep `AI_PROVIDER=mock` as a test-only configuration and leave `.env.example` on OpenRouter so production defaults remain provider-backed rather than silently mocked.

2026-08-24 — MVP acceptance audit
- Result: Closed the remaining automated AI-context gap by propagating document titles and bounded before/after text from PDF/EPUB selections into AI requests. Reconciled the automated portion of `AIACT-001` with the real-device boundary retained by `QA-SAFARI-001`.
- Verification: lint, typecheck, 52 unit tests including new EPUB/PDF selection-context regressions, 19 Chromium E2E tests, production Webpack build.
- Human boundary: Real iPhone Safari remains required before MVP sign-off; all other audited acceptance criteria have implementation or automated evidence.

2026-08-24 — DESK-001
- Result: Constrained the desktop shell viewport height and gave Reader/secondary panes their own scroll containers, preserving mobile drawer behavior.
- Verification: lint, typecheck, and focused Chromium E2E including desktop pane visibility plus independent scroll assertions.

2026-08-24 — NOTE-001
- Result: Added authenticated document notes with an owner-scoped SQLite table/repository, validated API, right-pane editor, explicit save, reload persistence, and visible retry on failure.
- Security decision: Note updates are scoped to both document ID and owner; a conflicting existing row is rejected rather than overwritten by another user.
- Verification: lint, typecheck, focused repository regression plus PDF core-journey E2E covering save/reload; full verification follows.

2026-08-24 — LANG-001
- Result: Added configurable translation target languages (English, French, Japanese, Portuguese, Simplified Chinese, Spanish) with an internally variable source language set to automatic detection.
- Verification: lint, typecheck, focused AI prompt regression including non-default Portuguese target, PDF core-journey E2E, then full verification.

2026-08-24 — VOC-001
- Result: Added multilingual vocabulary persistence with owner-scoped create/list/delete APIs, source-text provenance, selection locations, right-pane entry creation, reload restoration, deletion, and failure feedback.
- Verification: lint, typecheck, focused repository regression for French provenance/ownership, PDF core-journey E2E covering save/reload, followed by full verification.

2026-08-24 — PDF-002
- Result: Added coordinate-based PDF text extraction with deterministic line grouping and two-column ordering; PDF AI context now prefers extracted page text over visual DOM order.
- Verification: lint, typecheck, focused unit regressions for single-column, two-column, coordinate-missing fallback, and safe context capture; focused PDF E2E followed by full verification.

2026-08-24 — PAPER-001
- Result: Added safe PDF paper-structure inference for title, authors, abstract, Introduction, Methods, Results, Discussion, Conclusion, and References; propagated matching title/section/abstract provenance into centralized AI prompt context while keeping the structure out of persisted selection locations.
- Verification: lint, typecheck, focused unit regressions for inference fallbacks, PDF selection propagation, matching-section prompt context, and missing-section omission; full verification follows.

2026-08-24 — PDF-003
- Result: Connected paper-structure inference into live PDF selection capture and centralized AI prompt construction, with rendering and extraction failures isolated to fallback context.
- Verification: lint, typecheck, 66 unit tests, 20 Chromium E2E tests, production Webpack build via `npm run verify`.

2026-08-24 — Release readiness documentation and CI
- Result: Added setup, environment, migration, verification, SQLite backup/restore guidance, explicit current human/deployment boundaries, a `db:migrate` script, and GitHub Actions verification covering lint, typecheck, unit tests, Chromium E2E, and production build on pushes to main and pull requests.
- Verification: migration smoke test, password-hash command check, workflow content check, lint, typecheck, 66 unit tests, 20 Chromium E2E tests, production Webpack build via `npm run verify`.

2026-08-27 — QUALITY-001
- Result: Fixed the reader defects found by running the application at handover. PDF now shares one display scale between canvas and text layer and loads pdf.js's text layer stylesheet; the sample PDF is gone from the library page; EPUB chapters are sanitized through an allowlist and rendered as authored structure, with the EPUB's own title and author used at import; login inputs have visible labels; sessions are per device; the AI panel is rendered once; HTTP 429 is retryable with backoff; documents live behind a filesystem-backed `DocumentStorage` boundary and stream as bytes; uploads are verified against their leading bytes; connections and migrations are shared per database path.
- Verification: lint, typecheck, 97 unit tests, 26 Chromium E2E tests, production Webpack build. Live smoke test passed against OpenRouter `nvidia/nemotron-3-super-120b-a12b:free`.
- Important decision: every one of these shipped with a fully green suite. `pdf.spec.ts` and `ai-answer.spec.ts` had wrapped all assertions in `if (await locator.isVisible())`, which passes when the element is absent. Assertions are now unconditional, and the text-layer geometry check and owner scoping were confirmed by mutation — reintroducing each defect turns the corresponding test red.
- Follow-up: iPhone Safari verification remains HUMAN-001. Streaming AI responses and EPUB image rendering are still unimplemented.

2026-08-27 — PROD-CF-001 〜 PROD-CF-006
- Result: Cloudflare へデプロイした。EPUBパースをブラウザへ移し、Access認証・R2ストレージ・D1リポジトリの各境界を実装し、OpenNextでWorkerとして公開した。
- Verification: lint, typecheck, 119 unit tests, 39 Chromium E2E tests, production build。Worker preview で実バインディング動作を確認。デプロイ後の実URLに対し、未認証で `/` と `/api/documents` が Access のログインへ302されアプリに到達しないことを確認。
- Important decision: 無料枠の CPU 10ms は I/O 待ちを含まないため AI 応答の遅さは問題にならないが、scrypt検証は実測51〜79msで収まらない。認証を Access へ委譲し、JWT検証の実測は中央値1.25ms。Workerバンドルは gzip 1360 KiB で上限3 MiBに収まった。判断理由は `docs/DECISIONS.md` D-1〜D-15。
- Follow-up: `OPENROUTER_API_KEY` の secret 登録（H-5）と本人による本番動作確認（H-6b）。SSRのCPU実測は本番アクセス後に取る。
