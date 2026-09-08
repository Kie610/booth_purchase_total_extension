"use strict";

// 注文・商品CSVの出力。表計算ソフト・外部ツール・他人との共有に使う表示列だけを
// 書き出す。CSVからの取込はなく、全データの持ち出しと復元はバックアップJSON
// (backup.js)が担う。DOM・ストレージ・通信を使わない。

// Excelは先頭にBOMが無いとUTF-8と判断せず、日本語が文字化けする
const CSV_BOM = "\uFEFF";

// RFC 4180。区切り・引用符・改行を含む値だけを引用符で囲み、引用符は2つに重ねる。
// 数値と真偽値も文字列として書き出すので、呼び出し側で整形しておく
function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return CSV_BOM + rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

// 金額の列は、集計に取り込めるよう桁区切りを付けずに書く。
// 未収集や読み取り失敗は0ではなく空欄にする(0円の注文と区別できなくなるため)
function csvNumber(value) {
  return typeof value === "number" ? String(value) : "";
}

// 集計対象列は部分集計のときだけ、既存の表示列の後ろへ付ける。
function giftFilterCsvLabel(filter) {
  const mode = normalizeGiftFilter(filter);
  return mode === "all" ? null : GIFT_FILTER_LABELS[mode];
}

const ORDER_CSV_HEADER = [
  "注文番号",
  "注文日時",
  "ステータス",
  "お支払金額",
  "ギフト額",
  "商品合計",
  "送料",
  "差額",
  "商品点数",
];

// 注文単位。お支払金額の内訳(商品合計・送料)を並べて出し、それでも説明の付かない
// 分を「差額」に残す。クーポンなど、まだ拾えていないものがあればそこに出る
function buildOrdersCsv(results, filter) {
  const mode = normalizeGiftFilter(filter);
  const selected = mode === "all" ? results : filterResultsByGift(results, mode).rows;
  const rows = selected.map((r) => [
    csvText(r.id),
    csvText(r.date),
    csvText(STATUS_LABELS[r.status] || r.status),
    csvNumber(r.amount),
    csvNumber(typeof r.gift === "number" ? r.gift : null),
    csvNumber(sumItemAmounts(r.items)),
    csvNumber(Array.isArray(r.items) ? shippingAmount(r) : null),
    csvNumber(amountGapOf(r)),
    Array.isArray(r.items) ? String(r.items.length) : "",
  ]);
  return buildViewCsv(ORDER_CSV_HEADER, rows, mode);
}

const ITEM_CSV_HEADER = [
  "注文番号",
  "注文日時",
  "ステータス",
  "ショップ名",
  "ショップURL",
  "商品名",
  "単価",
  "数量",
  "BOOST",
  "ギフト",
];

// 商品単位。明細を取れていない注文も、欠けていると分かるように1行だけ出す
// (黙って落とすと、その注文を買っていないように見えてしまう)
function buildItemsCsv(results, filter) {
  const mode = normalizeGiftFilter(filter);
  const selected = mode === "all" ? results : filterResultsByGift(results, mode).rows;
  const rows = [];
  for (const r of selected) {
    const head = [csvText(r.id), csvText(r.date), csvText(STATUS_LABELS[r.status] || r.status)];
    if (!Array.isArray(r.items) || r.items.length === 0) {
      rows.push([...head, "", "", "(明細なし)", "", "", "", ""]);
      continue;
    }
    for (const item of r.items) {
      rows.push([
        ...head,
        csvText(item.shop),
        csvText(item.shopUrl),
        csvText(item.name),
        csvNumber(item.price),
        csvNumber(itemQuantity(item)),
        csvNumber(item.boost),
        item.gift ? "はい" : "いいえ",
      ]);
    }
  }
  return buildViewCsv(ITEM_CSV_HEADER, rows, mode);
}

// 種類・集計対象・アプリ版・端末のローカル日付をファイル名へ入れる。
function csvFileName(kind, date, filter) {
  const d = date || new Date();
  const stamp =
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const mode = normalizeGiftFilter(filter);
  const suffix = mode === "all" ? "" : `-${mode}`;
  return `booth-${kind}${suffix}-${DATA_VERSION}-${stamp}.csv`;
}

// 数式として解釈され得る文字列セルには先頭にアポストロフィを付ける。
// 数値列には使わず負の金額も数値のまま出す。
// 表計算アプリによる再保存後までの安全性を保証するものではない。
function csvText(value) {
  const text = value == null ? "" : String(value);
  return /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]|^[\u0000-\u001f\u007f-\u009f]/.test(text) ? `'${text}` : text;
}

// 表示列だけのCSV。絞り込み中は末尾に集計対象の列を足し、それ以外の列は
// 足さない(外部ツールが列位置や行数に依存して読むため、補助行や巨大セルを出さない)。
function buildViewCsv(baseHeader, dataRows, mode) {
  const label = giftFilterCsvLabel(mode);
  const header = label ? [...baseHeader, GIFT_FILTER_CSV_COLUMN] : baseHeader;
  return toCsv([header, ...dataRows.map((row) => label ? [...row, label] : row)]);
}

