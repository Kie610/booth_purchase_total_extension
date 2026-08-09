"use strict";

// 収集したデータをCSVにする処理だけを集めたファイル。
// DOMもストレージも触らない純粋な変換なので、そのままテストできる。

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

// D16 集計対象(D12のギフトフィルタ)で絞っている間に書き出したCSVは部分集計だが、
// ファイル単体を見るとそれが分からない。絞り込み中だけ末尾へ「集計対象」列を足す。
// **「すべて」のときのCSVは公開契約なので1バイトも変えない**(nullを返す)
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
  const label = giftFilterCsvLabel(filter);
  const rows = results.map((r) => [
    r.id,
    r.date,
    STATUS_LABELS[r.status] || r.status,
    csvNumber(r.amount),
    csvNumber(typeof r.gift === "number" ? r.gift : null),
    csvNumber(sumItemAmounts(r.items)),
    csvNumber(Array.isArray(r.items) ? shippingAmount(r) : null),
    csvNumber(amountGapOf(r)),
    Array.isArray(r.items) ? String(r.items.length) : "",
  ]);
  if (!label) return toCsv([ORDER_CSV_HEADER, ...rows]);
  return toCsv([
    [...ORDER_CSV_HEADER, GIFT_FILTER_CSV_COLUMN],
    ...rows.map((row) => [...row, label]),
  ]);
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
  const label = giftFilterCsvLabel(filter);
  const rows = [];
  for (const r of results) {
    const head = [r.id, r.date, STATUS_LABELS[r.status] || r.status];
    if (!Array.isArray(r.items) || r.items.length === 0) {
      rows.push([...head, "", "", "(明細なし)", "", "", "", ""]);
      continue;
    }
    for (const item of r.items) {
      rows.push([
        ...head,
        item.shop,
        item.shopUrl,
        item.name,
        csvNumber(item.price),
        csvNumber(itemQuantity(item)),
        csvNumber(item.boost),
        item.gift ? "はい" : "いいえ",
      ]);
    }
  }
  if (!label) return toCsv([ITEM_CSV_HEADER, ...rows]);
  return toCsv([
    [...ITEM_CSV_HEADER, GIFT_FILTER_CSV_COLUMN],
    ...rows.map((row) => [...row, label]),
  ]);
}

// booth-orders-20260727.csv のように、書き出した日を入れる。
// 絞り込み中は booth-orders-gift-20260727.csv のように集計対象も入れ、
// ファイル名だけでも部分集計だと分かるようにする
function csvFileName(kind, date, filter) {
  const d = date || new Date();
  const stamp =
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const mode = normalizeGiftFilter(filter);
  const suffix = mode === "all" ? "" : `-${mode}`;
  return `booth-${kind}${suffix}-${stamp}.csv`;
}
