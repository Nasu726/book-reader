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
| **Cloudflare Access設定** | **未 — 次にやること（H-4）** |
| Worker secrets登録 | 未（H-5） |
| ドメイン割り当て | 未（任意。H-6） |
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

## H-4. Cloudflare Access で Worker を保護する

**なぜ人間が必要か**
Zero Trustダッシュボードでの操作。`wrangler` のOAuthトークンにZero Trust/Accessのスコープが含まれていないため、エージェントからは実行できない（`wrangler whoami` のscope一覧で確認済み）。IdPの選択も本人の判断。

**背景**
現在の認証はscryptパスワードハッシュを使う。実測で検証1回あたり **51〜79ms CPU** を消費し、Workers無料枠の **10ms/リクエスト** を超えるため、Worker上ではログインが成立しない。加えてscryptの実装はbetter-sqlite3のセッションテーブルに依存しており、これはネイティブaddonなのでWorkerでは読み込めない。
Cloudflare Accessはアプリの手前で認証を済ませ、JWTを付けて通す。アプリ側はRS256の署名検証（実測 中央値1.25ms）だけで済む。Zero Trust無料枠は50ユーザー。

**現状**
- Zero Trust 開始済み。team name は `nasu726` → **team domain は `nasu726.cloudflareaccess.com`**
- Worker はデプロイ済み: https://book-reader.e9gp1ant-1729.workers.dev
- 未認証で `/` は `/login` へ、APIは全て401。データも無い。つまり**今は誰にも使えない状態で公開されている**

**手順**

ホスト名ごとにアプリを作るのではなく、**Worker単位で保護する**方が簡単。workers.dev・カスタムドメイン・ルート・プレビューがまとめて対象になる。

1. Cloudflareダッシュボード → **Workers & Pages** → **book-reader** を開く
2. **Access** タブ → **Protect this Worker behind Access**
3. **All traffic** を選ぶ（Previews only ではリーダー本体が保護されない）
4. **Authentication policy** で許可条件を作る
   - Action: `Allow`
   - Include → **Emails** → 自分のメールアドレス
   - 認証方法が未設定なら、先に Zero Trust → **Settings → Authentication** で追加する。**One-time PIN**（メールに届くコード）が最も手軽
5. Session Duration は任意。読書アプリなので `1 month` 程度が快適
6. **Apply Access**

**AUD tag の取得**

```
Zero Trust → Access controls → Applications → 作成されたアプリの Configure
  → Additional settings → Application Audience (AUD) Tag
```

> ダッシュボードのメニュー構成は変わる。2026-08時点では `Access` ではなく **`Access controls`** 配下にある。見つからない場合は現行ドキュメントを確認すること。

**伝えること**
- **AUD tag**（64文字の16進文字列）

team domain（`nasu726.cloudflareaccess.com`）は既に判明しているので不要。どちらも秘密情報ではなく、設定ファイルにコミットする。

**この後エージェントがやること**
`wrangler.jsonc` の `CF_ACCESS_TEAM_DOMAIN` と `CF_ACCESS_AUD` を埋めて再デプロイし、実際にAccess経由でサインインできることを確認する。

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

> ローカルの `.env.local` には既に設定済み。Worker側は別管理になる。

---

## H-6. 独自ドメインの割り当て（任意）

Worker単位でAccessを掛けるため、これは**必須ではない**。`book-reader.e9gp1ant-1729.workers.dev` のままでも動く。覚えやすいURLが欲しい場合だけ。

**手順**
Cloudflareダッシュボード → Workers & Pages → **book-reader** → **Settings → Domains & Routes** で保有ドメインのサブドメインを割り当てる。

Worker単位のAccess保護は追加したドメインにも自動的に適用されるので、Access側の再設定は不要。

**伝えること**: 割り当てたホスト名。

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
