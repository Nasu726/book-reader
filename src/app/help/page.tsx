import Link from "next/link";

import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "使い方 — AI Reader",
};

/**
 * 操作マニュアル。
 *
 * 日本語で書いてある。UIは英語のままなので、ボタン名だけ英語で引用している。
 * 読んで理解するための文章に母語を使うことと、UIの言語を変えることは別の話で、
 * 経緯は docs/DECISIONS.md の D-19 にある。
 *
 * サインインもデータベースも参照しない。サインインが壊れているときにこそ読み
 * たい文書だからで、中身は操作説明だけでユーザーのデータを含まない。本番では
 * Cloudflare Access がホスト全体をエッジで保護しているため、公開範囲は実質
 * 変わらない。
 */
export default function HelpPage() {
  return (
    <AppShell
      title={
        <div className="min-w-0">
          <Link className="text-sm text-zinc-600 hover:underline dark:text-zinc-400" href="/">
            ← Library
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">使い方</h1>
        </div>
      }
      reader={
        <article className="reader-prose mx-auto max-w-prose px-4 pb-16 sm:px-0">
          <p>
            PDFとEPUBを読み、気になった文章をその場でAIに聞くための個人用リーダー。
            保存したものはすべて本ごとに紐づき、開き直せば元の場所に残っている。
          </p>

          <h2>本を追加する・消す</h2>
          <p>
            ライブラリの <strong>Add a book</strong> を押すとファイル選択が開く。
            選んだ時点で送信が始まるので、他に押すボタンは無い。PDFまたはEPUB、100MBまで。
          </p>
          <p>各行のボタン:</p>
          <ul>
            <li><strong>Read</strong> — 開く</li>
            <li><strong>Rename</strong> — 表示名を変える。EPUBは本の中のタイトルを自動で採用するが、自分で変えたあとは上書きされない</li>
            <li>
              <strong>Remove</strong> — ライブラリから消す。
              <strong>取り込んだファイルごと消える</strong>し、その本のハイライト・ノート・単語帳・AIの会話も一緒に消える。確認ダイアログが出る
            </li>
          </ul>

          <h2>読む</h2>
          <p>
            PDFは全ページが縦に並ぶ。上の <strong>Page</strong> 欄に番号を入れればその
            ページへ飛ぶ。<strong>Zoom</strong> は 50〜300%で、%の数字を押すと画面幅に戻る。
          </p>
          <p>
            EPUBは <strong>Previous</strong> / <strong>Next</strong> で章を移動する。
          </p>
          <p>
            <strong>読書位置は自動で保存される</strong>ので、閉じて開き直すと続きから始まる。
          </p>

          <h2>文章を選んでAIに聞く</h2>
          <p>
            本文をなぞって選択すると、<strong>選択したところのすぐそばに小さなメニューが出る</strong>。
          </p>
          <ul>
            <li><strong>Explain</strong> — 説明させる</li>
            <li><strong>Translate</strong> — 訳させる</li>
            <li><strong>Simplify</strong> — やさしく言い直させる</li>
            <li>丸い色 — ハイライトを付ける（次の節）</li>
          </ul>
          <p>
            聞きたいことが決まっているときは、右側のパネル（スマホでは右下の
            <strong>Ask AI</strong> で下から出てくるシート）の <strong>Follow-up question</strong> に
            書いて <strong>Ask</strong> を押す。直前に選んだ文章が一緒に送られる。
          </p>
          <p>
            訳す先の言語は <strong>Translate</strong> を選んだときだけ出る。既定は日本語で、
            訳元の言語は指定しない（英語とは限らないため）。答えは日本語で返る。
          </p>

          <h2>保存されるもの3種と、その居場所</h2>
          <p>どれも右側のパネルにあり、本ごとに分かれている。</p>
          <ul>
            <li>
              <strong>Highlights</strong> — 付箋。選択メニューの丸い色を押すと、
              <strong>本文にその色が付く</strong>。一覧は <strong>Highlights</strong> の中で、
              <strong>Delete</strong> で消える。色を変えたいときは消してもう一度付ける
            </li>
            <li>
              <strong>Document note</strong> — その本に1つだけの自由なメモ。書いて
              <strong>Save note</strong>。空にして保存すると消える
            </li>
            <li>
              <strong>Save vocabulary</strong> — 単語帳。文章を選んでから意味を書いて保存すると、
              語・意味・引用元がまとめて残る
            </li>
          </ul>

          <h2>キーボード</h2>
          <ul>
            <li><strong>←</strong> / <strong>→</strong> — PDFはページ、EPUBは章を移動。最初と最後では何も起きない</li>
            <li><strong>↑</strong> <strong>↓</strong> <strong>Space</strong> <strong>PageUp</strong> <strong>PageDown</strong> — ふつうにスクロールする</li>
          </ul>
          <p>入力欄に文字を打っている間は、矢印キーはページを動かさない。</p>

          <h2>表示の設定</h2>
          <ul>
            <li><strong>Dark</strong> / <strong>Light</strong> — 画面の明暗</li>
            <li>
              <strong>文字サイズの %</strong> — <strong>EPUBのときだけ出る</strong>。
              PDFは紙のページを画像として表示しているので文字だけ大きくはできず、
              代わりに <strong>Zoom</strong> がある
            </li>
          </ul>
          <p>設定はブラウザに保存されるので、端末ごとに別々になる。</p>

          <h2>EPUBとは何か</h2>
          <p>
            電子書籍のファイル形式のひとつ。中身はWebページ（XHTMLとCSS）をZIPで
            固めたもので、拡張子は <code>.epub</code>。
          </p>
          <p>
            PDFとの一番の違いは、<strong>文字が画面の幅に合わせて流れ直す</strong>こと
            （reflowable）。文字を大きくすれば1ページあたりの行数が変わるだけで、
            レイアウトは崩れない。PDFは紙面をそのまま固定した形式なので、
            拡大縮小しかできず、スマホの画面では字が小さくなる。語学や長文を読むなら
            EPUBのほうが快適なことが多い。
          </p>
          <p>入手先の例:</p>
          <ul>
            <li><strong>Project Gutenberg</strong> — 著作権の切れた洋書</li>
            <li><strong>Standard Ebooks</strong> — 同じものを組版し直した版</li>
            <li><strong>青空文庫</strong> — 日本語の作品</li>
            <li>出版社や著者の直販</li>
          </ul>
          <p>
            <strong>DRM（コピー防止）が付いたものは開けない。</strong>
            Kindleなどで買った本がこれにあたる。
          </p>

          <h2>うまくいかないとき</h2>
          <ul>
            <li>
              ページに <strong>could not be drawn</strong> と出る — <strong>Try again</strong> を押す。
              そのページだけの失敗で、他のページは読める
            </li>
            <li>
              文字が選べない・選択位置がずれる — 紙をスキャンしただけのPDFの可能性がある。
              その場合、文字の情報を持っていないので選択もAIも使えない
            </li>
            <li>AIが答えない — APIキーとモデルの設定を確認する</li>
            <li>
              <strong>Daily save limit reached</strong> と出る — 無料枠を使い切らないための
              1日あたりの保存回数の上限に達している。翌日には戻る
            </li>
            <li>
              ハイライトの色が本文に付かない — ブラウザが古い可能性がある。
              一覧には残っているので、保存そのものは効いている
            </li>
          </ul>
        </article>
      }
    />
  );
}
