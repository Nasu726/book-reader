# AI Reader 引継ぎ資料

**作成日:** 2026-08-22  
**作成者:** Ox Alpha (Codex CLI / Windows環境)  
**引継ぎ先:** WSL Ubuntu-24.04 上の Codex CLI

---

## 1. プロジェクト概要

個人向けAI読書・論文読解・語学学習支援PWA。

> 本・論文・英語教材などを読みながら、理解できない箇所や深掘りしたい箇所について、その場でAIに質問できる個人用Reader

詳細は `docs/PLAN.md`、`docs/SPEC.md`、`docs/WORKMAP.md` を参照。

## 2. 現在の進捗

### 完了済み

| Task | 状態 | 備考 |
|------|------|------|
| BOOT-001 | DONE | リポジトリ把握完了。WORKMAP Execution Logに記録済み |
| BOOT-002 | DONE (PR #1) | Next.js 16 + TypeScript + Tailwind v4 スキャフォールド完了 |

### 進行中PR

- **PR #1:** https://github.com/Nasu726/book-reader/pull/1
  - ブランチ: `feat-bootstrap-scaffold`
  - 状態: open（マージ待ち）
  - 検証: lint ✅ / typecheck ✅ / production build ✅

### 次のタスク

1. **ARCH-001** — アーキテクチャ境界の定義（UI/parser/repository/AI provider/context/auth）
2. **TEST-001** — テストハーネス構築
3. **DB-001** — SQLite + Repository選定

依存関係は `docs/WORKMAP.md` §1 Dependency graph を参照。

## 3. 技術スタック

| 項目 | バージョン |
|------|-----------|
| Next.js | 16.3.2 |
| React | 19.2.8 |
| TypeScript | ^5 |
| Tailwind CSS | v4 (`@tailwindcss/postcss`) |
| ESLint | ^9 (flat config) |

パッケージマネージャ: npm

## 4. 主要な設計判断・規約

- **Provider independent:** OpenRouter / Ox Alpha固有処理をアプリケーションロジックに持ち込まない
- **Reader first:** AI機能より読書UXを優先
- **Mobile first, Chrome compatible:** iPhone Safari最重要、Chrome正式対応
- **UI→DB直接アクセス禁止、UI→Provider直接アクセス禁止**
- API keyはサーバー側のみ、client bundleに露出しない
- 詳細は `AGENTS.md` §5 実装原則を参照

## 5. Windows環境で発生した問題と対策

Windows上のCodex CLIでは以下の問題が発生し、WSL移行を決定した:

1. **pwsh.exe起動失敗** — Windows Store版pwshがsandboxからのプロセス生成を拒否（error 5）
2. **apply_patchのマルチライン引数破損** — cmd.exe /c経由で引数が正しく渡らない
3. **WSLへの引数渡しも壊れる** — cmd.exeのクォーティングエスケープが多段で破損

**対策:** WSL Ubuntu-24.04にCodex CLIを再インストールし、リポジトリもWSLネイティブファイルシステムに配置する。

## 6. WSL移行手順

```bash
# 1. WSL内にCodex CLIをインストール
npm install -g @openai/codex

# 2. リポジトリをWSLネイティブファイルシステムへクローン
cd ~
git clone https://github.com/Nasu726/book-reader.git
cd book-reader

# 3. 依存関係インストール
npm install

# 4. 動作確認
npm run verify

# 5. Codex起動
codex
```

**注意:** `/mnt/c/`経由はファイルI/Oが遅いので、必ず`~/`配下にクローンすること。既存のWindows側リポジトリは移行確認後に削除してよい。

## 7. Git運用

- ブランチ命名: `feat-<topic>` / `fix-<topic>`（スラッシュは使わない、Windowsのref lock問題回避）
- コミットメッセージ: conventional commits (`feat:`, `fix:`, `docs:` 等)
- mainへの直接push禁止、PR経由でマージ
- GitHub connector利用可（権限: admin）

## 8. 未解決事項・注意点

- [ ] PR #1のマージ（ユーザー承認待ち）
- [ ] `.env.example`未作成（BOOT-002のDeliverablesに含まれるが未対応）
- [ ] PWA manifest未作成（PWA-001タスクで対応予定）
- [ ] CLAUDE.mdがcreate-next-appにより自動生成された（内容確認・整理が必要かも）
