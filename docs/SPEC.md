# book-reader 仕様書

**Version:** 2.0（2026-09-13 の転回後）  
**文書種別:** Product / Technical Specification  
**優先度表記:** `MUST` = 必須 / `SHOULD` = 強く推奨 / `MAY` = 後回し可

v1.x（AI Reader）の仕様は git 履歴にある。転回の理由は `docs/DECISIONS.md` D-52。

---

## 0. 一文で

> **PDF / EPUB を快適に読み、印とメモを Obsidian の vault に残す個人用 Reader。** 質問・説明・翻訳は外部の AI に任せ、アプリはそこへ渡すコピーを快適にする。

---

## 1. 対象プラットフォーム

### ENV-001 — iPhone Safari
**MUST**

最新の一般提供 iOS 上の Safari で主要フローが動作すること。実機検証は HUMAN タスクでしか行えないため、自動検証は iPhone 17 の寸法・dpr の Chromium で行い、実機固有項目は `docs/HUMAN-TASKS.md` に残す。

### ENV-002 — Google Chrome
**MUST**

最新安定版 Google Chrome（デスクトップ）で主要フローが動作すること。

### ENV-003 — Responsive
**MUST**

狭い画面では本文 1 ペイン＋下から出るシート、十分な幅では本文＋右ペイン。

### ENV-004 — PWA
**MUST**

manifest、icon、standalone 起動、app shell のオフラインキャッシュを備える。ホーム画面から起動でき、通常ブラウザでも使える。`navigator.storage.persist()` を要求する。

---

## 2. 文書

### DOC-001 — Open a file
**MUST**

`<input type="file">` で PDF / EPUB を開ける。**文書の id はファイル内容の SHA-256**。同じファイルはどの端末で開いても同じ id になり、同じノートに結び付く。

### DOC-002 — Keep on this device
**MUST**

開いたファイルの byte 列を IndexedDB に保持し、次回はファイル選択なしで開ける。端末間で byte 列は共有しない（論文は端末ごと）。

### DOC-003 — Library
**MUST**

vault にあるノート（`Reading/*.md`）の一覧と、この端末にあるファイルの一覧を 1 つの Library として表示する。最低表示項目: 題名、追加日、status、この端末に本体があるか。本体が無いノートは「ファイルを開く」を求め、frontmatter の `source` があればそのリンクを示す。

### DOC-004 — Metadata
**SHOULD**

題名は PDF メタデータ → EPUB メタデータ → ファイル名の順で決め、手で直せる。`authors` / `source` は取れれば入れ、無ければ frontmatter から省く。

### DOC-005 — Remove from this device
**SHOULD**

この端末の byte 列を消せる。**ノートは消さない**（vault のノートを消すのは Obsidian か git で行う）。

---

## 3. Reader

### READ-001 — Navigate
**MUST**

PDF: ページ移動、ズーム（50〜300%、画面中央に向かって拡大）、Pages / Text の表示切り替え。EPUB: 章移動。

### READ-002 — Contents
**MUST**

PDF の outline（しおり）と EPUB のナビゲーションを目次として表示し、そこへ移動できる。見出しを推測して目次を作らない。

### READ-003 — Progress
**MUST**

読書位置を自動保存し、再度開いた際に復元する。**保存先はこの端末**（IndexedDB）。端末間で同期しない。

### READ-004 — Theme / Text size
**MUST**

ライト / ダークを切り替えられる。文字サイズは reflow する本文（EPUB、PDF の Text 表示）で変えられる。

### READ-005 — Scroll stability
**MUST**

シートの開閉、画面回転、ズーム、表示切り替えで読書位置を失わない。

### READ-006 — Two-column PDF
**SHOULD**

2 段組の論文 PDF を正しく表示できる。Text 表示はタグ付き PDF の構造ツリーを優先し、無ければレイアウトから段落を推定する。

---

## 4. 選択・印・コピー

### SEL-001 — Select text
**MUST**

本文のテキストを選択できる。iOS のネイティブ選択ハンドルを独自 UI で塞がない。

### SEL-002 — Selection menu
**MUST**

選択すると、選択のそばにメニューが出る。項目は **Copy / Copy with source / 色 4 つ**。メニューは画面からはみ出さず、タップ領域は 44px 以上。

### SEL-003 — Highlight
**MUST**

選択範囲を色付きの印として保存し、本文に色が付き、文書を開き直しても復元される。印は Pages 表示と Text 表示の両方に出る。

### SEL-004 — Highlight note
**MUST**

印ごとにメモを付けられる。単語と意味の記録はこれで行う（独立した Vocabulary 機能は持たない）。

### COPY-001 — Clean copy
**MUST**

PDF からのコピーは行末の改行を繋ぎ、ハイフン分割を戻した段落テキストにする。

### COPY-002 — Copy with source
**MUST**

`"…" — 題名, §節, p.N` の形。`source` があれば続けて付ける。

### COPY-003 — Paragraph copy
**MUST**

Text 表示では段落ごとに 1 タップでコピーできる（選択ハンドル不要、44px）。

---

## 5. ノートと vault

### NOTE-001 — One note per document
**MUST**

文書 1 つに Markdown ノート 1 つ。パスは `<VAULT_DIR>/<題名> (<id 先頭 8 桁>).md`。frontmatter に `title / added / status / tags`、あれば `authors / source`。

### NOTE-002 — Managed block
**MUST**

ノート内の `<!-- book-reader:start -->` 〜 `<!-- book-reader:end -->` だけをアプリが書く。**ブロック外はアプリが読むだけで書き換えない。** ブロックには印（引用、ページ、色、メモ、位置コメント）と Memo（文書メモ）が入る。

### NOTE-003 — Note is the store
**MUST**

印・メモの正本はノート本文。隠しファイルや別 JSON を置かない。`renderNote` と `parseNote` は純関数で、render → parse → render が同一になる。パーサは壊れた行を無視し、ブロックが無ければ全文を利用者の領域として扱う。

### NOTE-004 — Memo
**MUST**

文書ごとの自由記述メモをアプリで書け、ブロック内の `## Memo` に入る。空にすれば消える。

### VAULT-001 — Local-first
**MUST**

印・メモは IndexedDB に即保存され、オフラインでも読み書きできる。vault への書き込みは debounce（30 秒）した outbox が行い、繋がったときに流れる。保存失敗を無言で成功扱いしない。

### VAULT-002 — Merge
**MUST**

書く前に vault の現在版を読み、利用者の領域はそのまま、管理ブロックは印を id で union する（別端末で増えたものを落とさない）。ローカルで消した印は tombstone で除く。sha 衝突は読み直して 1 回だけ再試行する。

### VAULT-003 — One write, one commit
**SHOULD**

1 回の書き込み = 1 commit。メッセージは何をしたか分かる短文（`reader: <題名> (+2 highlights)`）。

---

## 6. サーバとセキュリティ

### SRV-001 — No database
**MUST**

サーバは静的資産の配信と vault 代理だけ。利用者のデータを持たない。

### SRV-002 — Vault proxy
**MUST**

`/api/vault/*` が GitHub contents API を代理する。`GET` / `PUT` のみ、パスは `VAULT_DIR` 配下の `.md` のみ（`..` 拒否）、本文サイズ上限、GitHub のエラーはステータスのみ返す。

### SEC-001 — Access
**MUST**

アプリ全体を Cloudflare Access の内側に置く。URL を知っているだけでは到達できない。

### SEC-002 — No secret in the browser
**MUST**

GitHub のトークンは Worker の secret（`VAULT_TOKEN`）にだけ存在し、レスポンス・ログ・bundle に出ない。ブラウザ側に設定画面は無い。

### SEC-003 — CSP
**MUST**

`default-src 'self'; connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'`。`unsafe-eval` を使わない。

### SEC-004 — Untrusted documents
**MUST**

EPUB の HTML はサニタイズし、script を実行しない。ノートの Markdown は HTML として描画しない。

### SEC-005 — Secrets in git
**MUST**

`.env*`、`.dev.vars` を commit しない。

---

## 7. 依存・信頼性・テスト

### DEP-001 — Prefer proven libraries
**MUST**

pdf.js、epub パーサ等を自作しない。新規依存は license / maintenance / security / supply-chain を確認してから。lockfile を commit する。

### REL-001 — Isolation
**MUST**

vault への書き込み失敗、ノートの解析失敗、PDF の抽出失敗が Reader の表示を壊さない。

### TEST-001 — Static
**MUST**

lint / typecheck / production build が通る。

### TEST-002 — Unit
**MUST**

ノートの往復、union マージと tombstone、Worker のパス検証と秘密の非漏洩、PDF 抽出・構造・outline、選択の正規化、find-range。

### TEST-003 — E2E
**MUST**

Chromium（デスクトップ、iPhone 17 寸法）で: ファイルを開く → 読む → 選択 → コピー → 印 → メモ → 開き直して復元 → vault（メモリ store の実 Worker）に書かれている。

### TEST-004 — Real device
**MUST（HUMAN）**

iPhone の PWA で: ファイルを開く → 印 → 機内モードでメモ → 復帰で同期 → PC の Obsidian に現れる。エージェントは実機確認を主張しない。

---

## 8. 受け入れ基準 — v2.0

- [ ] ファイルを開いて PDF / EPUB を読める（ページ、ズーム、Text 表示、目次、章移動）
- [ ] 読書位置がこの端末で復元される
- [ ] 選択メニューから Copy / Copy with source / 色付けができ、段落コピーが Text 表示にある
- [ ] 印にメモが付き、文書メモが書ける
- [ ] ノートが仕様の形式で vault に現れ、Obsidian で読める
- [ ] 利用者が Obsidian で書いた部分をアプリが壊さない（往復テストと E2E）
- [ ] オフラインで印とメモができ、復帰後に同期される
- [ ] ブラウザに秘密が無く、Worker が PAT を漏らさない（unit）
- [ ] Access の内側にあり、CSP が付いている
- [ ] lint / typecheck / unit / E2E / build が通る
- [ ] iPhone 実機で主要フローが成立する（HUMAN）
