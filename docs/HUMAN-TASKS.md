# 人間がやるべきこと

エージェントが実行できない作業だけをまとめる。認証情報の入力、課金の判断、実機確認、ブラウザ上のダッシュボード操作が該当する。

各項目は「なぜ人間が必要か」「手順」「終わったらエージェントに何を伝えるか」で構成する。
**上から順に、エージェントの作業を止めている度合いが高い。**

最終更新: 2026-08-27

---

## 状態サマリ

| 項目 | 状態 |
|---|---|
| Cloudflareアカウント | 済 |
| R2の有効化 | 済 |
| 独自ドメイン保有 | 済 |
| `wrangler` ログイン | **未** |
| D1データベース作成 | 未（wranglerログイン待ち） |
| R2バケット作成 | 未（wranglerログイン待ち） |
| Cloudflare Access設定 | 未 |
| Worker secrets登録 | 未 |
| iPhone実機確認 | 未（HUMAN-001） |

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

## H-2. D1 データベースの作成

**なぜ人間が必要か**
H-1の認可が前提。エージェントの実行環境からはCloudflareアカウントに触れない。

**手順**

```bash
npx wrangler d1 create book-reader
```

出力される `database_id` を控える。

**伝えること**: `database_id` の値（これは秘密情報ではない。`wrangler.toml` にコミットされる）。

---

## H-3. R2 バケットの作成

**手順**

```bash
npx wrangler r2 bucket create book-reader-documents
```

**伝えること**: 作成できたこと。バケット名を変えた場合はその名前。

---

## H-4. Cloudflare Access の設定

**なぜ人間が必要か**
Zero Trustダッシュボードでのアプリケーション登録とポリシー作成。ブラウザ操作であり、IdPの選択は本人の判断。

**背景**
現在の認証はscryptパスワードハッシュを使う。実測で検証1回あたり **51〜79ms CPU** を消費し、Workers無料枠の **10ms/リクエスト** を大幅に超えるため、そのままではログインが必ず失敗する。
Cloudflare Accessはアプリの手前で認証を済ませ、JWTを付けて通す。アプリ側はRS256の署名検証（1ms未満）だけで済む。Zero Trust無料枠は50ユーザー。

**手順**

1. Cloudflareダッシュボード → **Zero Trust** を開く。初回はチーム名（team domain）の設定を求められる。決めた名前を控える
   例: `nasu` → team domain は `nasu.cloudflareaccess.com`
2. **Settings → Authentication** で認証方法を追加する。最も手軽なのは **One-time PIN**（メールに届くコード）。Google や GitHub でもよい
3. **Access → Applications → Add an application → Self-hosted** を選ぶ
   - Application name: `AI Reader`
   - Session Duration: 任意（`1 month` 推奨。読書アプリなので頻繁な再認証は邪魔）
   - Application domain: デプロイ先のホスト名（例 `reader.example.com`）
4. ポリシーを作る
   - Policy name: `owner`
   - Action: `Allow`
   - Include → **Emails** → 自分のメールアドレス
5. 作成後、アプリケーションの **Overview** に表示される **Application Audience (AUD) Tag** を控える

**伝えること**
- **team domain**（例 `nasu.cloudflareaccess.com`）
- **AUD tag**（64文字の16進文字列）
- 使うホスト名（例 `reader.example.com`）

いずれも秘密情報ではない。設定ファイルにコミットする。

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

## H-6. 独自ドメインの割り当て

**手順**
デプロイ後、Cloudflareダッシュボード → Workers & Pages → 対象Worker → **Settings → Domains & Routes** で保有ドメインのサブドメインを割り当てる。

H-4で指定したホスト名と一致させること。

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
