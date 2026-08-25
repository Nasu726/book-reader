# AGENTS.md

このファイルはCodex / Ox Alphaが本リポジトリで継続作業するための入口である。

ユーザーから「AGENTS.mdを読んで作業して」または同等の指示を受けた場合、追加の細かな指示を待たず、以下の規約に従って自律的に次の作業を選び、実装・検証・記録まで進めること。

---

## 1. 最初に読むもの

作業開始時に、以下をこの順で確認する。

1. `AGENTS.md`
2. `docs/SPEC.md`
3. `docs/WORKMAP.md`
4. 必要な範囲の `docs/PLAN.md`
5. 現在のコード、tests、git status

役割:

- `docs/PLAN.md`: プロジェクトの目的・原則・優先順位
- `docs/SPEC.md`: 実装すべき仕様。機能要件のsource of truth
- `docs/WORKMAP.md`: Task、依存関係、現在状態のsource of truth
- `AGENTS.md`: 作業方法・判断規約

矛盾する場合の優先順位:

```text
直接のsystem/developer/user指示
> AGENTS.md
> docs/SPEC.md
> docs/WORKMAP.md
> docs/PLAN.md
> 推測
```

ただし、仕様と実装現状が食い違う場合は、無条件に大規模破壊せず原因を調査する。

---

## 2. 自律作業ループ

ユーザーから個別Taskが指定されていない場合:

1. `docs/WORKMAP.md` を確認する
2. `IN_PROGRESS` Taskがあれば、妥当な限りそれを継続する
3. なければ依存が解決済みの `READY` / 実質着手可能な `TODO` から最優先Taskを選ぶ
4. Taskを `IN_PROGRESS` に更新する
5. 対象コードを調査する
6. 必要最小限の設計判断を行う
7. 実装する
8. 検証する
9. 自分のdiffをレビューする
10. 問題があれば修正する
11. 完了条件を満たしたら `DONE` にする
12. 必要なExecution Logだけ追記する
13. Git操作が利用可能なら小さく意味のあるcommitを作る
14. 安全に続行可能なら次のTaskへ進む

「1回の指示 = 1 Task」に限定しない。コンテキスト・時間・ツール利用上限の範囲で、依存関係に沿って複数Taskを連続してよい。

ただし、巨大な変更を1 commit / 1 diffにまとめない。

---

## 3. ユーザーへ質問する条件

以下の場合のみ質問を優先する。

- 秘密情報 / credentialが必要
- irreversibleな外部操作が必要
- deploy先、課金、ドメイン等、ユーザー固有の選択が不可避
- 仕様同士が本質的に矛盾し、合理的なdefaultが存在しない
- データ消失につながる操作
- 権利上の判断をユーザーに委ねる必要がある

それ以外は合理的なdefaultを選び、必要ならExecution Logへ短く記録して進める。

不明点があっても、別の独立Taskが進められるなら作業全体を停止しない。

---

## 4. 作業単位

Taskは `docs/WORKMAP.md` のIDを使用する。

理想的な1 Task:

- 目的が1つ
- 主な責務が1つ
- 完了条件が明確
- 自動検証可能
- rollbackしやすい

作業中にTaskが大きすぎると判明したら、WORKMAPへsubtaskを追加して分割する。

仕様の追加要求を発見した場合も、既存Taskへ無制限に詰め込まずTask化する。

---

## 5. 実装原則

### Reader first

AI機能を増やすためにReader UXを壊さない。

### Context over model

AI品質問題を即座に「より強いモデル」で解決しない。context、prompt、source extractionを先に調査する。

### Provider independent

OpenRouter / Ox Alpha固有処理をアプリケーションロジックへ漏らさない。

### Mobile first, Chrome compatible

iPhone Safariを最重要実機環境とする。同時に最新Chromeを正式対応対象とする。

Desktopでは広い画面を活かしてよいが、モバイル体験を退行させない。

### No premature complexity

将来機能のためだけにMVPを過剰設計しない。

### Prefer proven libraries

PDF parser、EPUB parser、auth、test runner等を理由なく再実装しない。

ただし新規依存導入前にlicense、maintenance、security、最近のsupply-chain情報を確認する。

### Preserve boundaries

- UIはDBへ直接依存しない
- UIはProviderへ直接依存しない
- Provider secretはclientへ送らない
- PDF表示とtext extractionを過度に密結合しない
- prompt templateをUIへ散在させない

---

## 6. 禁止事項

- API key / password / tokenをcommitしない
- secretをclient bundleへ入れない
- lint / test / typecheckを無効化して「通った」ことにしない
- `any`、ignore directive、unsafe cast等で型問題を安易に隠さない
- failing testを理由なく削除しない
- 既存コード全体を書き直して小さな問題を解決しない
- dependencyを理由なく大量追加しない
- lockfileを無視しない
- 本物のiPhoneで確認していないのに「実機確認済み」と書かない
- 外部AI live testだけを自動テストの代わりにしない
- PDFの抽出失敗をReader表示失敗へ波及させない
- Ox Alphaの存在をアプリ本体の必須要件にしない

---

## 7. Verification

変更範囲に応じ、利用可能なものを実行する。

最低候補:

```text
lint
typecheck
unit tests
integration tests
E2E
production build
```

package scriptsが存在する場合はその正式commandを使う。

新機能には可能な範囲で回帰テストを追加する。

外部AI:

- 通常テストはmock / fake provider
- live smoke testは別扱い
- credential不在をテスト回避の理由にしない

Browser:

- Chrome / Chromium automated E2Eを可能な範囲で利用
- WebKit automated testも有用
- 実iPhone固有項目はHUMANとして残す

---

## 8. Diff review

Task完了前に自分のdiffを確認する。

最低チェック:

- Task外の不要変更がないか
- secretが混入していないか
- Provider / DB境界を破っていないか
- mobileを壊していないか
- Chrome互換性を落としていないか
- error pathがあるか
- testsが新挙動をカバーしているか
- dead code / debug logが残っていないか
- docs / WORKMAP更新が必要か

---

## 9. Git / GitHub

Gitが利用可能なら履歴を小さく保つ。

推奨:

```text
feat(reader): add epub navigation
feat(ai): add provider abstraction
test(context): cover budget trimming
fix(pdf): preserve selected text across action menu
```

### GitHub integrationがツールとして利用可能な場合

認証情報そのものをモデルが保持する必要はない。Codex環境から許可されたGitHub action / connectorが露出している場合、その権限範囲内で利用してよい。

推奨フロー:

1. current branch / status確認
2. 必要ならfeature branch
3. small commits
4. tests
5. push
6. PR作成が可能ならPR
7. CI確認
8. CI failureを修正

### 安全規約

- default branchへのforce push禁止
- history rewrite禁止（ユーザー明示指示を除く）
- secret commit禁止
- unrelated user changesをrevertしない
- destructive operationは確認する
- connector権限がread-onlyなら無理にwriteしない
- confirmationが要求されたactionは正規のconfirmation flowを使う

---

## 10. Dependency追加

新しいpackageを追加する前に:

1. 本当に必要か
2. platform / framework標準で代替できるか
3. 既存dependencyで代替できるか
4. license
5. maintenance
6. known security advisories
7. recent supply-chain incident reports
8. bundle / server impact

を確認する。

選定結果は長文レポートにせず、重要な判断だけcommit / WORKMAP logへ残す。

---

## 11. PDF / EPUB特則

### PDF

PDFは「画面上の見た目」と「論理的な文章順」が一致しないことを前提とする。

- renderer
- text layer
- text extraction
- selection normalization
- paper structure inference

を必要に応じて分離する。

2段組、hyphenation、改行を考慮する。

### EPUB

EPUBはreflow可能であることを活かす。

読書位置はDOMの一時的なpixel座標だけに依存せず、再オープン可能なlocation表現を優先する。

---

## 12. UI特則

### Mobile

本文を最優先する。

AI回答はBottom Sheet / Drawer / Inline等から実装時に最適なものを選べるが、以下を守る。

- selectionを失わない
- 本文位置を失わない
- keyboardで操作不能にならない
- long responseを扱える

### Desktop

十分な幅では左Reader / 右AI・操作・メモの2ペインを採用可能。

ただしReaderの可読幅を極端に広げない。

---

## 13. WORKMAPの更新

Task開始:

```text
Status: IN_PROGRESS
```

実装と検証が完了:

```text
Status: DONE
```

外部要因:

```text
Status: BLOCKED
```

実iPhone等、人間しか確認できない:

```text
Status: HUMAN
```

依存Task完了後、後続Taskが着手可能なら `READY` へ更新してよい。

重要な仕様変更が必要になった場合:

- 実装だけ先行して仕様を黙って変えない
- `docs/SPEC.md` を更新
- 必要なら `docs/PLAN.md` も更新
- WORKMAPへTaskを追加

---

## 14. 進捗報告

ユーザーへ報告する際は長い作業日誌ではなく、基本的に以下だけを示す。

- 完了したTask ID
- 何が使えるようになったか
- verification結果
- blockerがある場合だけblocker
- 次に進めるTask

ユーザーが詳細説明を要求した場合のみ深掘りする。

---

## 15. 完成判定

「コードを書いた」だけではDONEにしない。

TaskのDone条件 + verificationを満たすこと。

MVP完成判定は `docs/SPEC.md` のAcceptance Criteriaと `docs/WORKMAP.md` のCompletion Gatesに従う。

特に:

- SafariだけでなくChromeを正式対象とする
- 実機未確認を隠さない
- API keyをclientへ露出しない
- AI Providerを交換可能に保つ
- Reader単体の使いやすさを維持する

---

## 16. 最終原則

> **モデルが変わってもReaderは残る。**

Ox Alphaは強力な開発手段であって、AI Readerの永久的依存先ではない。

ユーザーが基本指示として「AGENTS.mdを読んで作業して」とだけ伝えた場合、このファイルとWORKMAPを使い、自分で次の安全な作業を選び、可能な範囲で連続して前進させること。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
