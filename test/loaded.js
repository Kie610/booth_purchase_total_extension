"use strict";

// 読み込めなかったファイルを名指しする。
//
// スクリプトの構文エラーは、そのファイルが丸ごと無かったのと同じ状態になる。
// 後続のファイルは読み込まれるので FAIL も出ず、どこが原因かが分からない。
// エラーの本文は harness.js が拾うが、拾えなかった場合でもファイル名だけは出す。
//
// const や class は window のプロパティにならないため、名前を参照して
// ReferenceError になるかどうかで確かめる。

const REQUIRED_GLOBALS = [
  ["common.js", () => CACHE_SCHEMA_VERSION],
  ["purchase-examples.js", () => PURCHASE_EXAMPLE_MASTER],
  ["csv.js", () => buildOrdersCsv],
  ["backup.js", () => buildBackup],
  ["share.js", () => drawShareCard],
  ["dashboard-parse.js", () => parseDetailPage],
  ["dashboard-view.js", () => render],
  ["dashboard-author-view.js", () => openAuthorPanel],
  ["dashboard-insights-view.js", () => renderSpendingTrends],
  ["dashboard-share-view.js", () => openSharePanel],
  ["dashboard.js", () => buildResults],
];

const notLoaded = REQUIRED_GLOBALS.filter(([, probe]) => {
  try {
    probe();
    return false;
  } catch {
    return true;
  }
}).map(([file]) => file);

if (notLoaded.length > 0) {
  loadFailureNote = `ERROR 読み込めていないファイル: ${notLoaded.join(", ")}`;
  showFailure(
    loadErrors.length > 0 ? loadErrors.join("\n") : "(エラー内容はブラウザのコンソールに出ています)"
  );
}
