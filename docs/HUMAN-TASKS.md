# 人間がやるべきこと

エージェントが実行できない作業だけをまとめる。認証情報の入力、課金の判断、実機確認、ブラウザ上のダッシュボード操作が該当する。

各項目は「なぜ人間が必要か」「手順」「終わったらエージェントに何を伝えるか」で構成する。
**上から順に、エージェントの作業を止めている度合いが高い。**

最終更新: 2026-08-27（Zero Trustのダッシュボード構成を現行UIに合わせて修正）

---

## 状態サマリ

| 項目 | 状態 |
|---|---|
| Cloudflareアカウント | 済 |
| R2の有効化 | 済 |
| 独自ドメイン保有 | 済 |
| `wrangler` ログイン | 済（2026-08-27） |
| D1データベース作成 | 済（エージェントが実行） |
| R2バケット作成 | 済（エージェントが実行） |
| Workerのデプロイ | 済（エージェントが実行） |
| Cloudflare Access設定 | 済（2026-08-27） |
| Worker secrets登録 | 済（2026-08-27） |
| 独自ドメイン割り当て | 済 `book-reader.nasu.uk` |
| **Access ログイン画面の組織名** | **未 — H-4b** |
| **One-time PIN が届かない** | **調査中 — H-4c** |
| iPhone実機確認 | 未（HUMAN-001） |

`wrangler login` が済んだ時点で、エージェントは認証済みCLIとしてD1・R2の作成やデプロイを実行できる。
ブラウザのダッシュボード操作と、秘密情報の入力だけが人間に残る。

---

## H-1. `wrangler` ログイン

**なぜ人間が必要か**
ブラウザでCloudflareアカウントへの認可を行う操作。エージェントはブラウザ上でのアカウント認可を代行できない。

**手順**

```bash
npx wrangler login
```

ブラウザが開くので、対象アカウントを選んで許可する。確認:

```bash
npx wrangler whoami
```

**伝えること**: 完了したことと、`wrangler whoami` に出た **アカウントID**。

**これが無いとエージェントが進めないこと**: D1作成、R2バケット作成、`wrangler.toml` のbinding確定、デプロイ。

> API tokenをエージェントに渡す必要はない。作成系コマンドはこの端末で実行する。

---

## H-2 / H-3. D1 と R2 — 完了（人間の作業は不要だった）

`wrangler login` 後はエージェントが実行できたため、こちらで作成済み。

| 種別 | 名前 | 識別子 | binding |
|---|---|---|---|
| D1 | `book-reader` | `c0ed3894-0dbf-4de3-b151-2bf35396d577`（APAC） | `DB` |
| R2 | `book-reader-documents` | — | `DOCUMENTS` |

`wrangler.jsonc` に記載済み。スキーマは `migrations/0001_initial_schema.sql` を remote と local の両方へ適用済み（8テーブル）。

既存の `quiz-db` と `mypage-images` は別プロジェクトのものなので触っていない。

---

## H-4. Cloudflare Access で Worker を保護する — 完了

2026-08-27 に設定済み。

| 項目 | 値 |
|---|---|
| team domain | `https://nasu726.cloudflareaccess.com` |
| AUD tag | `74063d23…f29930` |
| 保護対象 | Worker 単位（workers.dev・カスタムドメイン・ルート・プレビューを包含） |

`wrangler.jsonc` に反映してデプロイ済み。未認証アクセスは Access のログイン画面へ 302 され、アプリまで到達しない（`/` と `/api/documents` で確認）。

> ダッシュボードの構成は変わる。2026-08時点で Applications は `Access` ではなく **`Access controls`** 配下、AUD tag は `Configure → Additional settings`。手順が実物と食い違ったら、記憶ではなく現行ドキュメントを確認すること。

---

## H-4b. Access ログイン画面に出る組織名を直す

**症状**
サインイン画面に、変更前のランダムなチーム名が残っている。

**原因**
team domain を変えても、**ログイン画面に表示される「組織名」は自動では追随しない**。別設定として保持されている。

**手順**

```
Zero Trust → Custom pages → Team name and domain
  → 「Access login page」の Manage
  → Your Organization's name を書き換える
  → Save
```

同じページに Block page の設定もある。そちらも古い名前なら合わせて直す。App Launcher は Access login page の値を引き継ぐので個別の変更は不要。

---

## H-4c. One-time PIN のメールが届かない

**原因の候補（可能性の高い順）**

1. **入力したメールアドレスが Access ポリシーに含まれていない**
   Cloudflare は **ポリシーで許可されたアドレスにしかコードを送らない**。許可されていない場合でも、画面には「コードを送信しました」と出る。**届かない場合、まずこれを疑う。**

   確認:
   ```
   Workers & Pages → book-reader → Access タブ → ポリシーを確認
   ```
   または
   ```
   Zero Trust → Access controls → Policies
   ```
   `Include → Emails` に入力したアドレスが**完全一致**で入っているか確認する。別名やエイリアス（`+` 付きなど）は別物として扱われる。

2. **One-time PIN が identity provider として有効になっていない**

   ```
   Zero Trust → Integrations → Identity providers → Add new → One-time PIN
   ```

   > 以前この手順書には `Settings → Authentication` と書いていたが誤り。現在は **Integrations → Identity providers**。

3. **メールが迷惑メールに振り分けられている / フィルタに消費されている**
   送信元は `noreply@notify.cloudflare.com`。迷惑メールフォルダを確認し、必要なら許可リストへ追加する。
   企業のメールセキュリティ製品がリンクを自動走査すると、届く前にコードが使用済みになることがある。

4. **コードは1回限り**
   新しいコードを要求すると、前のコードは無効になる。複数回押していたら最新のメールだけが有効。

**確認できないこと**
`wrangler` の OAuth トークンに Zero Trust のスコープが無いため、エージェントからポリシーの中身を確認できない。1と2はダッシュボードで見てほしい。

**補足**
Access の認証はアプリの手前で完結するため、`wrangler tail` にも何も出ない。アプリまでリクエストが到達していないことは確認済み（`/` が302でAccessへ）。

---

## H-5. Worker secrets の登録

**なぜ人間が必要か**
APIキーそのものを扱う操作。エージェントに値を渡してはいけない（会話ログに残るため）。

**手順**

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

プロンプトにキーを貼る。確認:

```bash
npx wrangler secret list
```

**伝えること**: 登録できたこと。キーの値は不要。

> ローカルの `.env.local` には既に設定済み。Worker側は別管理で、現時点で登録済みのsecretは**ゼロ**（`wrangler secret list` が `[]`）。
> このため、いま本番でAIアクションを押すと 503 が返る。Reader自体（取り込み・表示・ハイライト・ノート・単語帳・読書位置）は影響を受けない。

登録後、モデルを変えたい場合は `wrangler.jsonc` の `AI_MODEL` を編集して再デプロイする。現在は `nvidia/nemotron-3-super-120b-a12b:free`。

---

## H-6. 独自ドメインの割り当て — 完了

`book-reader.nasu.uk` を割り当て済み。Worker単位のAccess保護が自動的に適用されていることを確認した（未認証で302、リダイレクト先の `kid` が同じAUD tag）。

本番URL: **https://book-reader.nasu.uk**

---

## H-6b. 本番の動作確認（Accessでサインインできるのは本人だけ）

**なぜ人間が必要か**
Access のポリシーがあなたのメールアドレスだけを許可しているため、エージェントは本番にサインインできない。ここから先の end-to-end 確認は本人にしか実行できない。

**URL**: https://book-reader.nasu.uk

**確認項目**

- [ ] Access のログイン画面が出て、One-time PIN 等でサインインできる
- [ ] ライブラリ画面が表示される（最初は空）
- [ ] PDF を取り込める
- [ ] EPUB を取り込める
- [ ] PDF が表示され、本文が二重に見えない。選択した箇所と実際の文字が一致する
- [ ] EPUB が見出し・段落を保って表示される
- [ ] ←/→ でページが送れる
- [ ] リロードしても読書位置が戻る
- [ ] ハイライト・ノート・単語帳が保存され、リロード後も残る
- [ ] テーマとフォントサイズがリロード後も残る
- [ ] AI アクション（H-5 のsecret登録後）

**伝えること**: 動かなかった項目と、可能ならスクリーンショット。エージェントは `npx wrangler tail` でサーバ側のログを見られる。

---

## H-7. iPhone 実機確認（HUMAN-001）

**なぜ人間が必要か**
iOSは全ブラウザをWKWebViewに強制するため、Linux上のChromiumでもPlaywrightのWebKitでも再現できない挙動がある。実機でしか確認できない。

**確認項目**

- [ ] 長押しでのテキスト選択と、ネイティブの選択ハンドル操作
- [ ] 選択後にAIドロワーを開いても選択が失われないこと
- [ ] キーボード表示時に本文が隠れないこと（Follow-up question 入力時）
- [ ] Safariのツールバー伸縮で本文の高さが破綻しないこと
- [ ] ラバーバンドスクロールと右ペインのスクロールが干渉しないこと
- [ ] PWAとしてホーム画面に追加し、standaloneで起動できること
- [ ] ノッチ/ダイナミックアイランド周辺で内容が欠けないこと

**手順（ローカルで試す場合）**

```bash
npm run dev -- --hostname 0.0.0.0
```

同一Wi-Fi上のiPhoneから `http://<PCのIP>:3000` を開く。
デプロイ後は本番URLで確認する方が実態に近い。

**伝えること**: 各項目の可否と、崩れた箇所のスクリーンショット。

---

## H-8. 課金判断（必要になった場合のみ）

**背景**
Workers無料枠は **CPU 10ms/リクエスト**。I/O待ち（OpenRouterの応答待ち、D1クエリ、R2読み出し）は**算入されない**ため、AI応答の遅さは問題にならない。
問題になるのは実際に計算する処理で、Cloudflare自身が「SSRは典型的に10〜20ms」と記載している。**Next.jsのページレンダリングが10msを超える可能性がある。**

Access導入でscryptの問題は消えるが、SSRの分は実測しないと分からない。

**超過した場合の選択肢**

| 選択 | 月額 | 内容 |
|---|---|---|
| Workers Paid | $5 | CPU上限が30秒（最大5分）になる。他の制限もほぼ消える |
| 静的化を進める | 0 | 動的SSRを減らしてクライアント描画へ寄せる。作業量は増える |
| 別ホストへ移す | 0〜 | Fly.io等のNode常駐ホスト。現行コードがほぼそのまま動く |

**判断が必要になったら**: デプロイ後の実測値をエージェントが提示する。それを見て決める。

---

## 補足: エージェントに渡してよい情報 / いけない情報

**渡してよい（設定ファイルにコミットされる公開情報）**
- アカウントID、`database_id`、R2バケット名
- Access の team domain、AUD tag
- ホスト名

**渡してはいけない（会話ログに残る）**
- API キー、API トークン
- パスワードの平文
- `wrangler` の認証情報

秘密は必ず `wrangler secret put` か `.env.local` へ直接書き込む。
