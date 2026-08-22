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
**Status:** TODO  
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
**Status:** TODO  
**Priority:** P0  
**Depends on:** PARSE-001, DEP-001

### Goal

PDF表示とtext layerを実装する。表示と抽出処理は分離する。

### Verify

- sample PDF renders in Chrome
- page navigation works
- text selection produces normalized candidate string
- renderer failure does not corrupt extraction pipeline

---

## PDF-002 — PDF extraction normalization
**Status:** SHOULD / Phase B  
**Priority:** P1  
**Depends on:** PDF-001

### Goal

改行、hyphenation、段組を考慮してAI context向けテキストを正規化する。

### Verify

- single column sample improves line joins
- two-column sample has deterministic extraction order or explicit limitation
- failure remains isolated from rendering

---

## PDF-003 — Paper structure inference
**Status:** TODO  
**Priority:** P1  
**Depends on:** PDF-002, PAPER-001

### Goal

論文的構造を可能な範囲で推定し、context builderへ渡す。

### Rule

推定失敗時にfallback textのみでReaderとAI requestを成立させる。

---

# 6. Authentication

## AUTH-001 — Single-user authentication
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
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
**Status:** TODO  
**Priority:** P0  
**Depends on:** READ-002

### Goal

Reader内選択を安定した内部表現として取得する。

### Verify

- EPUB selection captures text and stable range
- PDF selection captures text and page / geometry source
- focus movement during menu interaction preserves captured selection

---

## HILITE-001 — Highlight persistence
**Status:** MUST  
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
**Status:** TODO  
**Priority:** P0  
**Depends on:** SEL-001

### Goal

Explain / Translate / Simplify / Ask / Highlightへ到達できるselection menuを作る。

### Verify

- native iOS selection handles are usable
- menu opens without losing selection intent
- keyboard does not trap focus
- long selected text remains operable

---

## CTX-001 — Context builder
**Status:** TODO  
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

---

## CONV-001 — Conversation storage
**Status:** TODO  
**Priority:** P0  
**Depends on:** DB-002, AI-003

### Goal

会話とmessageをdocument context付きで保存する。

### Verify

- conversation history loads
- selected text / location preserved
- failed assistant message leaves recoverable state

---

## AIACT-002 — AI answer presentation
**Status:** TODO  
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
**Status:** TODO  
**Priority:** P0  
**Depends on:** E2E-001

### Goal

最新Chrome系ブラウザで主要フローを自動確認する。

### Verify

- login, import, read, select, explain, restore position flow passes
- responsive layouts checked
- console critical errors absent

---

## QA-SAFARI-001 — Safari automated QA
**Status:** TODO  
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

---

# 12. End-to-end MVP

## E2E-001 — Core user journey
**Status:** TODO  
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

---

# 13. Desktop / Paper / Language extensions

## DESK-001 — Desktop two-pane UX
**Status:** TODO  
**Priority:** P1  
**Depends on:** AIACT-002, UI-003

### Goal

Chrome等の広い画面で左Reader / 右AI・操作領域を提供する。

### Verify

- responsive collapse
- Reader width remains readable
- right pane independently scrollable as appropriate

---

## NOTE-001 — Document notes
**Status:** TODO  
**Priority:** P1  
**Depends on:** DESK-001, DB-002

### Goal

右ペインに文書メモを提供する。

### Verify

- autosave or explicit save
- reload persistence
- save failure visible

---

## PAPER-001 — Paper structure extraction
**Status:** TODO  
**Priority:** P1  
**Depends on:** PDF-002, CTX-001

### Goal

Title / Authors / Abstract / major sectionsを可能な範囲で構造化する。

### Rule

heuristic failureで通常Readerを壊さない。

---

## LANG-001 — Configurable translation languages
**Status:** TODO  
**Priority:** P1  
**Depends on:** AIACT-002

### Goal

Translateのsource / target languageを内部的に可変にし、UIから設定可能にする。

### Verify

英語→日本語以外のpairを少なくともテストする。

---

## VOC-001 — Vocabulary
**Status:** TODO  
**Priority:** P1  
**Depends on:** LANG-001, DB-002, SEL-001

### Goal

選択した語 / phraseを出典付きで保存する。

### Rule

英単語専用のschemaにしない。

---

# 14. Production hardening

## PROD-001 — Deployment storage decision
**Status:** TODO  
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

---

## PROD-002 — Backup / export
**Status:** TODO  
**Priority:** P1 before production  
**Depends on:** PROD-001

### Goal

個人データを失わない最低限のbackup / export方法を用意する。

---

## SEC-REVIEW-001 — Secret / auth review
**Status:** TODO  
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

---

# 15. Human acceptance

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

ログを詳細な日記にしない。恒久的な仕様変更は `SPEC.md`、方針変更は `PLAN.md` に反映する。
