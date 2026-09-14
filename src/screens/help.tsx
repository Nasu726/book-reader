import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";

/**
 * 操作マニュアル。
 *
 * 日本語で書いてある。UIは英語のままなので、ボタン名だけ英語で引用している。
 * 読んで理解するための文章に母語を使うことと、UIの言語を変えることは別の話で、
 * 経緯は docs/DECISIONS.md の D-19 にある。
 *
 * 中身は操作説明だけで、利用者のデータを含まない。
 */
export function HelpScreen() {
  useEffect(() => { document.title = "使い方 — book-reader"; }, []);

  return (
    <AppShell
      title={
        <div className="min-w-0">
          <a className="text-sm text-ink-quiet hover:underline" href="/">
            ← Library
          </a>
          <h1 className="truncate text-lg font-semibold tracking-tight">使い方</h1>
        </div>
      }
      reader={
        <article className="reader-prose mx-auto max-w-prose px-4 pb-24 sm:px-0" id="top">
          <p>
            PDFとEPUBを読み、印とメモを残すための個人用リーダー。
            質問や翻訳は Claude / ChatGPT / DeepL に文章を貼って行う。
            保存したものはすべて本ごとに紐づき、開き直せば元の場所に残っている。
          </p>


          {/* A manual is read by looking things up, not from the top. Without
              this the only way to find the part about EPUBs was to scroll past
              everything else and recognise it going by. */}
          <nav aria-label="Contents" className="border-rule text-ink-quiet my-6 border-y py-4 text-sm">
            <ol className="space-y-1">
              <li><a className="hover:text-ink underline underline-offset-4" href="#add">本を開く・この端末から消す</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#read">読む</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#mark">文章を選んで、コピーするか印を付ける</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#saved">保存されるもの2種と、その居場所</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#vault">印とメモは vault へ行く</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#keyboard">キーボード</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#display">表示の設定</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#epub">EPUBとは何か</a></li>
              <li><a className="hover:text-ink underline underline-offset-4" href="#trouble">うまくいかないとき</a></li>
            </ol>
          </nav>

          <h2 className="scroll-mt-4" id="add">本を開く・この端末から消す</h2>
          <p>
            ライブラリの <strong>Open a file</strong> を押すとファイル選択が開く。
            選んだ時点で本が開く。PDFまたはEPUB。
          </p>
          <p>
            <strong>ファイルはこの端末の中に留まる</strong>（ブラウザの保存領域）。どこにも送られない。
            次からはライブラリの一覧から開ける。別の端末で読むなら、そちらでも同じファイルを開く —
            同じファイルなら同じ本として扱われ、印やメモが繋がる。
          </p>
          <p>各行のボタン:</p>
          <ul>
            <li><strong>Read</strong> — 開く</li>
            <li><strong>Rename</strong> — 表示名を変える。EPUBは本の中のタイトルを自動で採用するが、自分で変えたあとは上書きされない</li>
            <li>
              <strong>Remove</strong> — <strong>この端末からファイルを消す</strong>。
              印とメモは消えない（vault のノートに残る）。確認ダイアログが出る
            </li>
          </ul>

          <h2 className="scroll-mt-4" id="read">読む</h2>
          <p>
            PDFは全ページが縦に並ぶ。上の <strong>Page</strong> 欄に番号を入れればその
            ページへ飛ぶ。<strong>Zoom</strong> は 50〜300%で、%の数字を押すと画面幅に戻る。
            拡大は画面の中央に向かって行われ、はみ出したぶんは左右にスクロールできる。
          </p>
          <p>
            PDFには読み方が2つある。<strong>Pages</strong> は紙をそのまま描く（図・表・
            段組みが元のまま）。<strong>Text</strong> は本文だけを取り出して流し込む
            ——<strong>文字が選びやすくなり、文字サイズも変えられる</strong>が、
            レイアウトは失われる。上のボタンで切り替える。選んだ側は記憶される。
          </p>
          <p>
            ハイライトは<strong>どちらの表示で付けても両方に出る</strong>。印は
            見せ方ではなく文章に付いているため。
          </p>
          <p>
            EPUBは <strong>Previous</strong> / <strong>Next</strong> で章を移動する。
            そのあいだの一覧から章を選んでも飛べる。
          </p>
          <p>
            PDFにしおり（作者が付けた目次。LaTeXや出版社のPDFにはたいてい入っている）が
            あれば、<strong>Page</strong> 欄の隣に同じ一覧が出る。閉じた状態では
            <strong>いまどの節にいるか</strong>を示す。しおりの無いPDFには出ない —
            見出しを推測して目次をでっち上げることはしない。
          </p>
          <p>
            <strong>読書位置は自動で保存される</strong>ので、閉じて開き直すと続きから始まる。
          </p>

          <h2 className="scroll-mt-4" id="mark">文章を選んで、コピーするか印を付ける</h2>
          <p>
            本文をなぞって選択すると、<strong>選択したところのすぐそばに小さなメニューが出る</strong>。
            <strong>Copy</strong> / <strong>Copy with source</strong> と、丸い色。
          </p>
          <ul>
            <li>
              <strong>Copy</strong> — 選んだ文章を<strong>文章として</strong>コピーする。
              PDFは1行ごとに改行が入り、行末で単語が「at-」「tend」のように切れているが、
              それを繋いで段落にする。段落の切れ目だけは残す
            </li>
            <li>
              <strong>Copy with source</strong> — 文章のあとに空行と
              「— 題名, §節, p.ページ」の行が付く。ノートや質問に貼ったとき、どこからの引用か残る
            </li>
            <li>丸い色 — その色の印が本文に付く</li>
          </ul>
          <p>
            <strong>Text</strong> 表示では、各段落の末尾に小さなコピーの印がある。
            押すと<strong>段落まるごと</strong>がコピーされる。スマホで選択ハンドルを引きずるより早い。
          </p>
          <p>
            質問したい・訳したいときは、こうしてコピーして Claude / ChatGPT / DeepL に貼る。
            論文全体について聞くなら、最初に PDF そのものを渡しておくとよい。
            アプリの中に AI は無い — 外のものの方がよく出来ているので。
          </p>

          <h2 className="scroll-mt-4" id="saved">保存されるもの2種と、その居場所</h2>
          <p>
            右側のパネル（スマホでは右下の <strong>Notes</strong> で下から出てくるシート。
            上端の横棒を下へスワイプすると戻る）は <strong>Marks</strong> と
            <strong>Notes</strong> の2つに分かれている。本文に付けた印と、自分で書いたものは
            別のものなので、混ざらない。どちらも本ごとに分かれている。
          </p>
          <ul>
            <li>
              <strong>Marks</strong> タブ — 付箋。選択メニューの丸い色を押すと、
              <strong>本文にその色が付く</strong>。一覧はこのタブにあり、
              <strong>Delete</strong> で消える。色を変えたいときは消してもう一度付ける。
              単語と意味を残したいときは、その語に印を付けてメモを書く
            </li>
            <li>
              <strong>Notes</strong> タブの <strong>Document note</strong> — その本に1つだけの自由なメモ。書いて
              <strong>Save note</strong>。空にして保存すると消える
            </li>
          </ul>

          <h2 className="scroll-mt-4" id="vault">印とメモは vault へ行く</h2>
          <p>
            本ごとに <strong>Markdown のノート 1 枚</strong>が、あなたの Obsidian vault（GitHub の repo）に書かれる。
            場所は <code>Reading/題名 (id).md</code>。中身は上から、frontmatter（題名・追加日・status・tags）、
            印の引用（色とページ付き、その下にメモ）、Document note。この部分は
            <code>&lt;!-- book-reader:start --&gt;</code> と <code>&lt;!-- book-reader:end --&gt;</code> の
            2 行に挟まれていて、<strong>アプリが書き換えるのはその間だけ</strong>。
            その外に書いたこと、Obsidian で足したプロパティは、そのまま残る。
          </p>
          <p>
            書き込みはまずこの端末に保存され、少し経ってから vault に送られる。
            すぐ送りたいときは <strong>Notes</strong> タブの <strong>Sync now</strong>。
            オフラインなら、繋がったときに送られる。別の端末で付けた印は、本を開いたときに vault から届く。
            同じ印を両方で変えたときは、印は合算、メモと status は後に書いた方が残る。
          </p>
          <p>
            <strong>Copy note as Markdown</strong> は、そのノートを今の状態で丸ごとコピーする。
            vault の設定が済んでいない間の手動の代わりに。
          </p>

          <h2 className="scroll-mt-4" id="keyboard">キーボード</h2>
          <ul>
            <li><strong>←</strong> / <strong>→</strong> — PDFはページ、EPUBは章を移動。最初と最後では何も起きない</li>
            <li><strong>↑</strong> <strong>↓</strong> <strong>Space</strong> <strong>PageUp</strong> <strong>PageDown</strong> — ふつうにスクロールする</li>
          </ul>
          <p>入力欄に文字を打っている間は、矢印キーはページを動かさない。</p>

          <h2 className="scroll-mt-4" id="display">表示の設定</h2>
          <ul>
            <li><strong>Dark</strong> / <strong>Light</strong> — 画面の明暗</li>
            <li>
              <strong>文字サイズの %</strong> — <strong>EPUBのときだけ出る</strong>。
              PDFは紙のページを画像として表示しているので文字だけ大きくはできず、
              代わりに <strong>Zoom</strong> がある
            </li>
          </ul>
          <p>設定はブラウザに保存されるので、端末ごとに別々になる。</p>

          <h2 className="scroll-mt-4" id="epub">EPUBとは何か</h2>
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

          <h2 className="scroll-mt-4" id="trouble">うまくいかないとき</h2>
          <ul>
            <li>
              ページに <strong>could not be drawn</strong> と出る — <strong>Try again</strong> を押す。
              そのページだけの失敗で、他のページは読める
            </li>
            <li>
              文字が選べない・選択位置がずれる — 紙をスキャンしただけのPDFの可能性がある。
              その場合、文字の情報を持っていないので選択も印も付けられない
            </li>
            <li>
              ハイライトの色が本文に付かない — ブラウザが古い可能性がある。
              一覧には残っているので、保存そのものは効いている
            </li>
          </ul>
          {/* Plain anchors, so the manual works with scripting off — which is
              the state a page explaining how to use something should survive. */}
          <a
            className="border-edge bg-paper text-ink-quiet hover:text-ink right-(--gutter) bottom-(--gutter) fixed rounded-lg border px-3 py-2 text-xs tracking-wide uppercase no-underline shadow-sm transition-colors duration-(--fast)"
            href="#top"
          >
            ↑ Top
          </a>
        </article>
      }
    />
  );
}
