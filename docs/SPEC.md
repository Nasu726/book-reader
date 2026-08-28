# AI Reader 仕様書

**Version:** 1.1  
**文書種別:** Product / Technical Specification  
**優先度表記:** `MUST` = MVP必須 / `SHOULD` = 強く推奨 / `MAY` = 後回し可

---

## 1. 対象プラットフォーム

### ENV-001 — iPhone Safari
**MUST（受け入れは延期）**

最新の一般提供iOS上のSafariで主要ユーザーフローが動作すること。

2026-08-27: 要件としては維持するが、MVP完成判定のブロッカーから外す。実機検証はHUMAN-001でしか行えず、待機が開発全体を止めるため。モバイルレイアウトの退行防止は自動検証を継続する。

### ENV-002 — Google Chrome
**MUST**

最新安定版Google Chromeで主要ユーザーフローが動作すること。デスクトップChromeを正式な対応対象とする。

### ENV-003 — Responsive
**MUST**

狭い画面では1ペイン、十分に広い画面ではReaderと操作領域を併置できるレスポンシブ設計とする。

### ENV-004 — PWA
**MUST**

PWAとして必要なmanifest、icon、standalone起動に必要な設定等を備える。PWAインストールをサポートするプラットフォームではホーム画面 / アプリ一覧から起動可能にする。

通常ブラウザとしてのアクセスも常に可能とする。

---

## 2. 文書管理

### DOC-001 — Import
**MUST**

ユーザーはPDFまたはEPUBファイルをアプリへ取り込める。

### DOC-002 — Library
**MUST**

取り込んだ文書を一覧表示できる。

最低表示項目:

- title
- type
- author（取得できる場合）
- last opened
- reading progress

### DOC-003 — Metadata
**MUST**

可能な範囲で以下を保存する。

```text
id
title
type
author
source_filename
created_at
updated_at
```

Metadata抽出に失敗しても手動またはfilename fallbackにより文書を開けること。

### DOC-004 — Delete
**SHOULD**

文書を削除できる。関連データの扱いを明示し、孤児データを残さない。

---

## 3. Reader

### READ-001 — Open
**MUST**

LibraryからPDF / EPUBを開ける。

### READ-002 — Navigate
**MUST**

- PDF: ページ移動
- EPUB: 章 / 内部位置移動

ができる。

### READ-003 — Progress
**MUST**

読書位置を自動保存し、再度開いた際に復元する。

### READ-004 — Theme
**MUST**

ライト / ダーク表示を切り替えられる。

### READ-005 — Font size
**MUST for EPUB / SHOULD for reflowable content**

本文の文字サイズを変更できる。固定レイアウトPDFでは無理に再組版せず、zoom等の形式に適した操作を提供する。

### READ-006 — Scroll stability
**MUST**

AI操作、Drawer / Sheet開閉、画面回転、ブラウザ戻る操作等で、不必要に読書位置が先頭へ戻らない。

### READ-007 — Desktop layout
**SHOULD**

十分な画面幅では、

- 左: Reader
- 右: AI conversation / actions / notes

を基本候補とする2ペインUIを提供する。

### READ-008 — Two-column PDF
**SHOULD**

2段組論文PDFを少なくとも正しく表示できること。

抽出テキストの読み順については別要件 `PDF-002` とする。

---

## 4. Text Selection / Highlight

### SEL-001 — Select text
**MUST**

Reader内のテキストをユーザーが選択できる。

### SEL-002 — Selection action menu
**MUST**

選択後に以下へ到達できる。

- Explain
- Translate
- Simplify
- Ask
- Highlight

### SEL-003 — Preserve selection intent
**MUST**

AI操作ボタンを押すためにフォーカスが移動しても、対象テキストを失わない。

Selection Rangeまたは内部表現を操作開始時に確保する。

### SEL-004 — Mobile usability
**MUST**

iOSのネイティブselection UIを過度に妨害しない。独自UIがネイティブハンドルの操作を妨げない。

### SEL-005 — PDF selection normalization
**SHOULD**

PDF内で視覚上連続する文章が改行・text item境界をまたぐ場合、AIへ渡す選択テキストを可能な範囲で自然な文章へ正規化する。

例:

```text
inter-
national
```

や不自然な行末改行等の扱いを改善する。

完全対応はMVPのブロッカーにしない。

### SEL-006 — Highlight
**MUST**

選択範囲をハイライトとして保存し、文書を再度開いても復元できる。

---

## 5. AI機能

### AI-001 — Explain
**MUST**

選択箇所を現在の文書コンテキストを踏まえて説明する。

### AI-002 — Translate
**MUST**

選択箇所をユーザーが理解できる言語へ翻訳できる。

初期利用では英語→日本語が中心でもよいが、実装を英語 / 日本語の固定pairにしない。

少なくとも以下が将来可能な内部設計にする。

```text
source_language = auto
target_language = configurable
```

### AI-003 — Simplify
**MUST**

選択文章の意味を可能な限り保持しながら平易な表現へ変換する。

対象言語を英語に固定する必要はない。初期UIが英語学習を優先することは許容する。

### AI-004 — Ask
**MUST**

選択箇所に対して自由質問を送信できる。

### AI-005 — Streaming
**SHOULD**

対応Providerでは回答を段階表示できる設計が望ましい。ただしProviderの `generate()` のみでもMVP完成を妨げない。

### AI-006 — Cancel
**SHOULD**

長いAIリクエストをキャンセルできる。

### AI-007 — Retry
**MUST**

一時的なAPI失敗後にユーザーが再試行できる。

### AI-008 — Error presentation
**MUST**

rate limit、timeout、network error、provider errorを「Reader自体の失敗」と混同せず表示する。

---

## 6. AI Provider

### PROV-001 — Provider abstraction
**MUST**

アプリケーションコードは特定Provider SDK / endpointへ直接依存しない。

最低インターフェース:

```ts
interface AIProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}
```

型名や詳細はコードベースに合わせて変更可能。

### PROV-002 — OpenRouter
**MUST**

最初のProviderとしてOpenRouterを利用できる。

### PROV-003 — Model configuration
**MUST**

ProviderとModelを設定で切り替えられる。

例:

```env
AI_PROVIDER=openrouter
AI_MODEL=<model-id>
```

### PROV-004 — Future provider
**MUST**

OpenAI等の別Provider追加時にReader / UIの主要コードを書き換える必要がない。

### PROV-005 — Server only secret
**MUST**

AI Provider API keyはサーバー側でのみ参照する。

---

## 7. Context Builder

### CTX-001 — Inputs
**MUST**

Context Builderは必要に応じて以下を入力とする。

```text
document metadata
current chapter / section
previous surrounding text
selected text
following surrounding text
conversation history
user request
```

### CTX-002 — Selection priority
**MUST**

選択テキストとユーザー質問を最優先情報として保持する。

### CTX-003 — Budget
**MUST**

全文書を無条件に送らず、context budgetを設ける。

### CTX-004 — Deterministic tests
**MUST**

Context Builderは外部AIを呼び出さずにunit test可能な構造にする。

### CTX-005 — Prompt separation
**MUST**

Explain / Translate / Simplify / Askのprompt templateをUIコンポーネントへ直接埋め込まない。

---

## 8. Conversation

### CONV-001 — Persist conversation
**MUST**

AIとの会話を文書に紐づけて保存する。

### CONV-002 — Message data
**MUST**

最低限以下を保持する。

```text
id
conversation_id
role
content
selected_text
created_at
```

必要に応じてsection / location等を追加する。

### CONV-003 — Continue
**MUST**

同一文書上で過去の会話を踏まえた続きの質問ができる。

### CONV-004 — Context limit
**MUST**

会話履歴全量を永続的に毎回送信しない。Context Builder側で使用量を制限する。

---

## 9. Notes / Vocabulary

### NOTE-001 — Document notes
**SHOULD**

デスクトップ右ペイン等から文書に紐づく自由メモを保存できる。

### VOC-001 — Save vocabulary
**SHOULD / Phase C**

単語・フレーズを出典付きで保存できる。

最低候補:

```text
id
term
meaning
source_document_id
source_text
source_location
created_at
```

### VOC-002 — Multilingual
**SHOULD / Phase C**

Vocabularyを英単語専用スキーマにしない。

---

## 10. Paper mode

### PAPER-001 — Structure extraction
**SHOULD / Phase B**

可能な範囲で以下を認識する。

- Title
- Authors
- Abstract
- Introduction
- Methods
- Results
- Discussion
- Conclusion
- References

### PAPER-002 — Research prompts
**SHOULD / Phase B**

以下の質問に適した文脈を構築できる。

- この研究の核心
- 示したこと
- 示していないこと
- 著者の主張
- 重要な実験
- 主張を支える結果
- 限界
- 今後の研究

### PDF-001 — Render separately from extraction
**MUST**

PDF表示処理と、AI用テキスト抽出処理を分離する。

### PDF-002 — Reading order
**SHOULD / Phase B**

2段組等で抽出テキストの読み順を改善する。

誤抽出時にReader表示まで壊さない。

---

## 11. Data model

初期候補。実装時に正規化・ORM上の都合で変更してよいが、能力を失わないこと。

### documents

```text
id
title
type
author
source_filename
created_at
updated_at
```

### document_sections

```text
id
document_id
section_index
title
content
location_data
```

### reading_progress

```text
id
document_id
position
updated_at
```

### highlights

```text
id
document_id
section_id
start
end
text
location_data
note
created_at
```

### conversations

```text
id
document_id
created_at
updated_at
```

### messages

```text
id
conversation_id
role
content
selected_text
source_location
created_at
```

### notes

```text
id
document_id
content
created_at
updated_at
```

### vocabulary

```text
id
term
meaning
source_document_id
source_text
source_location
created_at
```

---

## 12. Authentication / Security

### SEC-001 — Authentication
**MUST**

URLを知っているだけではReaderへアクセスできない。

Version 0.1では単一ユーザー認証でよい。

### SEC-002 — Password
**MUST**

パスワードを平文保存しない。

### SEC-003 — Session
**MUST**

認証状態を安全なサーバー管理またはHttpOnly cookie等で保持し、認証tokenを不要にJavaScriptへ公開しない。

ProductionではSecure cookieを利用する。

### SEC-004 — Secrets
**MUST**

`.env*` 等の秘密ファイルをGitへcommitしない。

`.env.example` にはキー名のみを記載する。

### SEC-005 — Upload validation
**MUST**

アップロード時に最低限以下を行う。

- 許可拡張子 / MIME確認
- file size上限
- path traversalを起こさない保存方式
- 任意ファイル実行を行わない

---

## 13. Dependency policy

### DEP-001 — Prefer proven libraries
**MUST**

標準機能や既存依存で十分でなければ、成熟したライブラリを使ってよい。PDF / EPUB parser等を理由なく自作しない。

### DEP-002 — Review before add
**MUST**

新規依存追加時に、少なくともlicense、maintenance、security、supply-chain上の懸念を確認する。

### DEP-003 — Pin reproducibly
**MUST**

lockfileをcommitし、再現可能なinstallを維持する。

---

## 14. Reliability

### REL-001 — AI failure isolation
**MUST**

AI API失敗でReaderや保存済み読書位置を破壊しない。

### REL-002 — Save durability
**MUST**

progress / highlight / notes等の保存失敗を無言で成功扱いしない。

### REL-003 — Database abstraction
**MUST**

UIから直接DBを操作しない。Repository / service境界を持つ。

### REL-004 — Backup path
**SHOULD before production**

DB / user dataのbackupまたはexport経路を用意する。

---

## 15. Testing

### TEST-001 — Static
**MUST**

- lint
- typecheck
- production build

が通る。

### TEST-002 — Unit
**MUST**

最低対象:

- AI Provider adapter
- Context Builder
- selection normalization
- parser utilities
- repositories / pure utility

### TEST-003 — Integration
**MUST**

API → AI Service → Provider mock等の主要境界を検証する。

### TEST-004 — E2E
**MUST**

主要フローを自動化可能な範囲で検証する。

```text
Login
→ Import document
→ Open
→ Select text
→ Explain
→ Response
→ Continue reading
```

### TEST-005 — Safari
**MUST**

iPhone Safariで実機確認が必要な項目を `WORKMAP.md` に残す。

エージェント環境で実機確認できない場合、確認不能を成功扱いしない。

### TEST-006 — Chrome
**MUST**

Chrome latest stableで主要フローを検証する。

自動E2Eが可能ならChromium系テストをCIへ含める。

---

## 16. Acceptance Criteria — MVP

以下がすべて満たされたとき、Version 0.1 MVPを完成扱いにできる。

- [x] 認証できる
- [x] PDFを取り込んで開ける
- [x] EPUBを取り込んで開ける
- [x] Readerとして移動できる
- [x] 読書位置を復元できる
- [x] テキスト選択できる
- [x] Highlightを保存 / 復元できる
- [x] Explainが動く
- [x] Translateが動く
- [x] Simplifyが動く
- [x] Askが動く
- [x] AIは周辺contextを受け取れる
- [x] AI失敗後もReaderを継続利用できる
- [x] Provider / Modelを設定から変更できる
- [x] API keyがclient bundleへ露出しない
- [ ] iPhone Safariで主要フローが成立する（HUMAN-001。2026-08-27にMVPブロッカーから除外）
- [x] Chromeで主要フローが成立する
- [x] モバイル幅でReader優先レイアウトが維持される（Chromium自動検証）
- [x] lint / typecheck / tests / production buildが通る
- [x] PDFのtext layerがcanvasと一致し、選択位置がずれない
- [x] EPUB本文が見出し・段落構造を保って表示される
- [x] 複数端末で同時にログインを維持できる
- [x] AI providerのrate limitがReaderの失敗として露出しない
- [x] uploadした文書のbyte列がSQLiteの外に置かれる
- [x] PWAとして必要な構成が存在する

`SEL-005 PDF selection normalization`、高度な論文構造抽出、Vocabulary等は未完でもMVPを成立させられる。
