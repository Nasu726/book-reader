# AI Reader 開発計画書

**Version:** 1.1  
**文書種別:** Project Plan  
**対象:** 個人用AI読書・論文読解・語学学習支援PWA  
**開発支援:** Codex + OpenRouter / Ox Alpha  
**初期開発目安:** 7日間相当の短期スプリント（作業は日付ではなく `docs/WORKMAP.md` の依存関係付きTask単位で進める）

---

## 1. プロジェクト概要

### 1.1 目的

本プロジェクトでは、

> **本・論文・英語教材などを読みながら、理解できない箇所や深掘りしたい箇所について、その場でAIに質問できる個人用Reader**

を開発する。

中心思想は次のとおり。

> **AIに本を読ませるのではなく、AIと一緒に本を読む。**

AIによる全文要約を主役にせず、読書中の疑問解消、翻訳、平易化、自由質問を自然に挟みながら、そのまま読書へ戻れる体験を最優先する。

### 1.2 利用環境

必須の主要対象は以下。

- iPhone + Safari
- 最新安定版のGoogle Chrome（デスクトップを含む）
- PWAとして利用可能な環境ではPWA利用をサポート
- PCでは通常のWebアプリとして快適に利用できること

モバイルファーストで設計するが、PCは単なる「表示できる」状態ではなく、広い画面を活用したUIを提供する。

### 1.3 開発実験としての目的

本開発は、OpenRouter経由のOx AlphaをCodex上で利用し、外部モデルによる実装ワークフローを検証する実験も兼ねる。

検証対象:

- 既存コードベースの調査
- 実装
- テスト
- デバッグ
- リファクタリング
- 依存関係を踏まえた複数Taskの連続実行
- Git / GitHubを含む開発ワークフロー
- モデル交換を前提とした継続開発

ただし、**開発に使うモデル**と**完成したAI Readerが実行時に使うモデル**は完全に分離する。

Ox Alphaの提供条件が変化・終了しても、AI Reader本体は別モデルへ交換可能でなければならない。

---

## 2. MVP

### 2.1 MVPの完成条件

Version 0.1の最小完成条件は次の一連の体験である。

```text
PDF / EPUBを取り込む
        ↓
文書を開いて読む
        ↓
文章を選択する
        ↓
Explain / Translate / Simplify / Ask
        ↓
AI回答を確認する
        ↓
読書位置を失わず続きを読む
```

このフローがiPhone Safariで実用的に動作し、Chromeでも正常に利用できることをMVPの成功条件とする。

### 2.2 MVPの中核機能

- PDF / EPUB取り込み
- 文書一覧
- Reader
- ページ / 章移動
- 読書位置保存
- テキスト選択
- ハイライト
- 文字サイズ変更（形式上可能な範囲）
- ダークモード
- Explain
- Translate
- Simplify
- Ask
- AI回答UI
- 会話保存
- 最低限の認証
- APIキーのサーバー側保護
- PWA対応
- Safari / Chrome互換性確認

### 2.3 MVPでは必須としないもの

- 高度な知識グラフ
- ベクトルDB
- 高度なRAG
- 全書籍の常時コンテキスト投入
- 高度なOCR
- 音声読み上げ / 音声会話
- 複数ユーザー
- SNS
- 課金
- 一般公開サービス向け管理画面
- 高度なSRS
- PDFのすべての特殊レイアウトに対する完全対応

PDFの改行・複数段組をまたぐ選択の正規化は価値が高いが、MVPを止めるブロッカーにはしない。

---

## 3. 技術方針

### 3.1 基本技術

- Next.js
- React
- TypeScript
- Tailwind CSS
- PWA
- 初期DB候補: SQLite

既存リポジトリに技術選定が存在する場合は、それを壊さず合理性を確認したうえで継承する。

### 3.2 外部ライブラリ

車輪の再発明を避ける。

無料で利用可能で、ライセンス上問題がなく、広く利用され、保守状況が良好で、既知の重大なサプライチェーン上の懸念が見つからないライブラリは積極的に利用してよい。

ただし、新規依存を追加する際は以下を確認する。

- ライセンス
- 保守状況
- 最近のリリース状況
- 既知の重大な脆弱性
- 最近報告されたサプライチェーンインシデント
- 既存依存で代替可能か
- バンドルサイズやブラウザ互換性への影響

ライブラリ名やバージョンをこの計画書で過度に固定せず、実装時点の安全性と互換性を優先する。

### 3.3 AI Provider

アプリケーションロジックからOpenRouterやOx Alphaを直接呼び出さない。

```text
Application
    ↓
AI Service
    ↓
AIProvider
    ├─ OpenRouterProvider
    ├─ OpenAIProvider
    └─ FutureProvider
```

ProviderとModelを別設定にする。

```env
AI_PROVIDER=openrouter
AI_MODEL=<model-id>
```

モデル固有IDをUIやビジネスロジックへ埋め込まない。

### 3.4 Database

初期実装ではSQLiteを候補とするが、Repository / Data Access境界を設ける。

```text
Application
    ↓
Repository
    ↓
Database
```

将来PostgreSQL / Supabase等へ移行できるようにする。

デプロイ先がSQLite永続化に適さない場合は、Production移行前にDBを再評価する。

---

## 4. UX方針

### 4.1 Mobile

iPhoneでは本文領域を最大化する。

重要事項:

- iOSテキスト選択との競合を避ける
- 長押し・選択・スクロールを壊さない
- AI回答後も読書位置を維持する
- キーボード表示時のレイアウト崩れを避ける
- AI回答が本文を完全に覆い続けない
- タップ領域を十分確保する

### 4.2 Desktop / Chrome

広い画面では2ペインを基本候補とする。

```text
┌───────────────────────────────┬─────────────────────┐
│                               │ AI / 操作 / メモ     │
│           Reader              │                     │
│                               │                     │
│                               │                     │
└───────────────────────────────┴─────────────────────┘
```

右ペインにはAI会話、選択操作、文書メモ等を配置できる構造とする。

レスポンシブ幅が不足した場合は1ペインへ戻す。

### 4.3 論文

論文PDFでは1ページ2段組、脚注、図表、数式、ヘッダ・フッタがあり得ることを前提とする。

「表示」と「テキスト抽出 / 選択 / AI context」を分離して考え、表示できることと文章順序を正しく復元できることを同一問題として扱わない。

---

## 5. AI Context方針

AIには選択文字列だけを渡さず、必要に応じて以下を構築する。

```text
document metadata
+
current chapter / section
+
surrounding text
+
selected text
+
conversation history
+
user question
```

全文書を毎回送信しない。

Context Builderは以下を制御する。

- 前後文脈量
- 会話履歴量
- token / character budget
- 重複除去
- 不要セクション除外
- 選択箇所の優先度

品質向上は「より高価なモデルを使う」だけでなく、適切なcontext構築によって達成する。

---

## 6. 拡張計画

### Phase A — Reader + AI MVP

- PDF / EPUB
- Reader
- AI 4操作
- context
- persistence
- auth
- PWA
- Safari / Chrome QA

### Phase B — Paper Reader

- 論文構造
- 2段組等の抽出改善
- 研究の核心 / 主張 / 証拠 / 限界を問うための補助
- PDF選択正規化改善

### Phase C — Language Learning

- 多言語翻訳
- 文法解説
- Vocabulary
- フレーズ保存
- 出典付き単語カード

Translateは英語→日本語に固定しない。初期UIがそのユースケースを優先しても、内部設計は任意言語へ拡張可能にする。

### Phase D — Reading Sessions

- 文書に紐づく継続会話
- 「ここまでの議論」
- 過去の選択箇所との比較
- 著者の主張の流れの整理

### Phase E — Personal Knowledge

- 文書横断検索
- 概念間関係
- 過去の読書との関連提示
- 復習支援

---

## 7. セキュリティ方針

### 7.1 AI API

禁止:

```text
Browser → OpenRouter
```

採用:

```text
Browser → Application Server → AI Provider → OpenRouter
```

APIキーを以下へ含めない。

- Client bundle
- HTML
- localStorage
- public environment variables
- Git repository

### 7.2 認証

個人利用でもURL秘匿だけに依存しない。

Version 0.1では単一ユーザー認証でよい。

認証後のセッションは安全なCookie等を利用し、パスワード平文保存を行わない。

---

## 8. 品質方針

実装後は対象範囲に応じて以下を実行する。

- lint
- typecheck
- unit tests
- integration tests
- E2E
- production build

外部AI APIは通常の自動テストではmock可能にする。

主要E2Eフロー:

```text
Login
→ Document import
→ Document open
→ Text select
→ Explain
→ AI response
→ Continue reading
```

ブラウザ互換性は最低限以下を確認する。

- iPhone Safari
- Google Chrome latest stable

可能であればデスクトップSafari / Chromium系ブラウザでも退行を避ける。

---

## 9. 成功指標

MVP成功は機能数ではなく次で判断する。

### Reader usability

AIなしでも文書を読み続けられる。

### AI interaction

文章選択から質問までの操作が自然である。

### Context quality

選択部分だけを見た表面的回答ではなく、周辺文脈を踏まえた回答が得られる。

### Reliability

AI失敗やネットワーク失敗によって読書位置や保存済みデータが破壊されない。

### Browser compatibility

iPhone SafariとChromeで主要フローが成立する。

### Architecture

AI Provider / Modelを交換してもReader本体を大きく変更しない。

### Security

秘密情報がクライアントやGitへ漏れない。

---

## 10. 想定リスク

### PDF

PDFのテキストは論理的な文章順ではなく座標付き文字として保持される場合がある。

対策:

- 表示と抽出を分離
- 2段組を想定
- 選択文字列の正規化
- 問題文書をfixture化して回帰テスト

### EPUB

文書ごとにCSSや構造差がある。

対策:

- EPUB処理をReader本体から分離
- 章境界と読書位置の安定した内部表現を定義

### SQLite / Deployment

一部のホスティング方式ではローカルSQLite永続化が適さない。

対策:

- Repository層
- deployment選定時の再評価
- backup/export経路

### Browser差異

SafariとChromeではselection、scroll、viewport、PWA挙動が異なる。

対策:

- ブラウザ固有コードを必要最小限にする
- 実機 / E2Eで両方を確認
- selectionロジックをユーティリティとしてテスト可能にする

### AI API

- model終了
- rate limit
- pricing変更
- timeout
- context limit

対策:

- Provider abstraction
- retry / timeout
- error UI
- model設定の外部化

---

## 11. 開発の優先順位

```text
1. Reader usability
2. AI interaction
3. Context quality
4. Reliability
5. Mobile UX
6. Chrome / desktop UX
7. Paper support
8. Language learning
9. Knowledge system
```

新機能が1〜6を悪化させる場合は、原則として新機能を後回しにする。

---

## 12. 開発運用

この計画書は「何を目指すか」を定義する。

実装上の正確な要件は `docs/SPEC.md`、実際の作業順序と依存関係は `docs/WORKMAP.md`、Codex / Ox Alphaの常設実行規約はリポジトリ直下の `AGENTS.md` を正とする。

日付ベースのDay 1〜7は人間向けの目安に留め、エージェントは `WORKMAP.md` 上の依存解決済みTaskを単位として作業する。

---

## 13. 最重要原則

1. **Reader first**
2. **Context over model**
3. **Provider independent**
4. **Mobile first, Chrome compatible**
5. **Dogfooding**
6. **Small verifiable tasks**
7. **No premature complexity**
8. **Prefer maintained libraries over unnecessary reinvention**
9. **Never expose secrets**
10. **モデルが変わってもReaderは残る**
