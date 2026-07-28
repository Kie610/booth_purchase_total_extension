"use strict";

// テストページのエラー拾い。
//
// **ここをインラインの <script> に書いてはいけない。** index.html は拡張と同じ
// `script-src 'self'` を宣言しており、インラインスクリプトは実行されずに
// 黙って捨てられる。かつてここがインラインだったため、読み込み時の構文エラーを
// 誰も拾わず、結果が「running...」のまま止まって原因が分からなかった。

// 読み込み中のエラーは1つとは限らない(先に落ちたファイルのせいで後続も落ちる)。
// 最初の1件で上書きせず、出そろった分をまとめて出す
const loadErrors = [];

// 読み込めなかったファイルの名指し。あとから出る例外で消えないよう先頭に残す
let loadFailureNote = "";

// ファイル名の見出しを出したかどうか。毎回足すと同じ行が積み重なる
let notePrinted = false;

// 途中で例外が出たときは、そこまでの結果を消さずに末尾へ足す。
// 消してしまうと、どのcheckまで進んでいたのかが分からなくなる
function showFailure(message) {
  const out = document.getElementById("out");
  if (!out) return;
  const done = out.textContent === "running..." ? "" : out.textContent;
  const head = loadFailureNote && !notePrinted ? `${loadFailureNote}\n` : "";
  if (head) notePrinted = true;
  out.textContent = head + done + `\n${message}`;
}

// 構文エラーも拾えるよう capture 段階で待ち受ける
window.addEventListener(
  "error",
  (event) => {
    loadErrors.push(`${event.message} @${event.filename}:${event.lineno}`);
    showFailure(`ERROR\n${loadErrors.join("\n")}`);
  },
  true
);

window.addEventListener("unhandledrejection", (event) => {
  showFailure(`ERROR ${(event.reason && event.reason.stack) || event.reason}`);
});
