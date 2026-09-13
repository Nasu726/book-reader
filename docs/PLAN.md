# book-reader 開発計画書

**Version:** 2.0（2026-09-13 の転回後）  
**文書種別:** Project Plan  
**対象:** 個人用の PDF / EPUB Reader。印とメモを Obsidian の vault に残す  
**開発:** Claude Code。作業は `docs/WORKMAP.md` の依存関係付き Task 単位で進める

v1.x（AI Reader、Codex / Ox Alpha 期）の計画は git 履歴にある。

---

## 1. 目的

> **本と論文を快適に読み、読んだ跡（印・メモ）を自分の知識の置き場（Obsidian）に、自分の言葉で残す。**

中心思想:

> **プラットフォームが既に持っているものは作らない。**

- 質問・説明・要約は Claude / ChatGPT に PDF を渡せば済む → アプリは**そこへ渡すコピー**を快適にする
- 翻訳は DeepL / Claude に貼れば済む → 同上
- 知識の蓄積・検索・繋がり・RAG は Obsidian（Graph、Dataview、Smart Connections）と Claude Projects が担う → アプリは**出力の型を揃える**
- 認証は Cloudflare Access、保存は GitHub → アプリはデータベースを持たない

アプリに残る仕事は 2 つだけ: **読むこと**（pdf.js の描画、Text 表示、目次、ズーム、印の描画）と、**読んだ跡をノートに書くこと**。

### 1.1 利用環境

- iPhone Safari（PWA としてホーム画面から）
- 最新安定版の Google Chrome（デスクトップ）

モバイルファーストで設計し、PC では広い画面を活かす。

### 1.2 Paper Collector との関係

`Nasu726/paper-collector` は本人専用の論文収集ツールとして別に存在する。Reader は Collector に依存しない。境界は **PDF ファイル**（Collector で見つけた論文を保存し、Reader で開く）。

---

## 2. 技術方針

### 2.1 構成

```
Cloudflare Worker（Access の内側、データベース無し）
 ├ static assets   Vite でビルドした PWA
 └ /api/vault/*    GitHub contents API の代理（PAT は Worker の secret）

ブラウザ
 ├ IndexedDB       ファイルの byte 列、読書位置、ノートのローカル状態、outbox
 ├ pdf.js / epub パーサ
 └ /api/vault      ノートの GET / PUT / 一覧
```

- Vite ＋ React ＋ TypeScript ＋ Tailwind v4。ルーティングは hash（静的ホストで設定不要）
- ローカル開発と E2E は `@cloudflare/vite-plugin` で Worker を Vite dev 内に走らせ、`VAULT_STORE=memory` で GitHub に触れない

### 2.2 秘密の置き場

GitHub のトークンはブラウザに置かない。XSS に対しては localStorage も IndexedDB もメモリも同じで、違いは盗まれた秘密の**持続性**。サーバ側の secret なら、XSS はセッション中しか動けず持ち出せる秘密が無い。

その代償として本アプリは一般公開しない（本人専用、Access の内側）。公開したくなったときは transport（`vault-client.ts`）を「ブラウザが PAT を持つ版」に差し替えられるが、それは別の判断。

### 2.3 ノートがデータベース

印・メモの正本は vault の Markdown ノート本文。アプリはノート内の管理ブロックだけを書き、外は利用者の領域として触らない。隠しファイルや別 JSON を置かない（人に見えないもの、同期ツールが飛ばすものを正本にしない）。

### 2.4 外部ライブラリ

車輪の再発明を避ける。新規依存は license / maintenance / security / supply-chain / 既存依存での代替可否 / bundle への影響を確認してから。lockfile を commit する。

---

## 3. UX 方針

### 3.1 Mobile

本文を最大化する。印・メモは下から出るシートで、スワイプで戻せる。入力欄は 16px 以上（iOS のズーム抑止）。タップ領域は 44px 以上。

### 3.2 Desktop

十分な幅では本文＋右ペイン（Marks と Memo）。本文の可読幅を広げすぎない。

### 3.3 コピー

外部 AI・翻訳への導線はコピー。PDF は行末の改行とハイフン分割を繋いだ段落として渡す。出典付きコピーで引用元を残す。Text 表示では段落を 1 タップで取れる。

### 3.4 目視

数字だけで完了にしない。iPhone 17 幅とデスクトップの画面を撮って読む（D-25）。

---

## 4. セキュリティ方針

- Cloudflare Access で全体を保護する。Email domain 条件に公開プロバイダ（gmail.com 等）を使わない
- ブラウザに秘密を持たない。`VAULT_TOKEN` は `wrangler secret`。チャットに貼らない
- CSP を付ける（`script-src 'self'`、`unsafe-eval` 無し）。pdf.js のフォント経由の任意実行の類はこれで不発
- EPUB の HTML はサニタイズ。ノートの Markdown は HTML として描画しない
- vault 代理は `GET` / `PUT` のみ、`VAULT_DIR` 配下の `.md` のみ

---

## 5. 品質方針

- lint / typecheck / unit / E2E / build を `npm run verify` で
- 新しい振る舞いには回帰テスト。テストは mutation で赤くなることを確認してから信用する
- 実機（iPhone）確認は HUMAN。エージェントは「実機確認済み」と書かない
- 失敗を無言で成功扱いしない（保存、同期、解析）

---

## 6. 開発運用

この計画書は「何を目指すか」。実装上の要件は `docs/SPEC.md`、作業順序と状態は `docs/WORKMAP.md`、作業規約は `AGENTS.md`、判断理由は `docs/DECISIONS.md`、人間待ちは `docs/HUMAN-TASKS.md`。

---

## 7. 最重要原則

1. **Reader first**
2. **プラットフォームが持っているものは作らない**
3. **ノートがデータベース。利用者の領域を壊さない**
4. **ブラウザに秘密を持たない**
5. **Mobile first, Chrome compatible**
6. **Small verifiable tasks**
7. **No premature complexity**
8. **目視してから完了と言う**
