"use strict";

// 注文・商品CSVの出力と取込。出力は表計算ソフト・外部ツール・他人との共有に
// 使う表示列だけで、全データの持ち出しはバックアップJSON(backup.js)が担う。
// 取込は、表示列だけのCSV(1.0.0以降の全版)と、1.2.0が末尾に付けていた
// 「データバージョン」「復元用データ」列付きのCSVの両方を受け付ける。
// DOM・ストレージ・通信を使わない。JSONの検証と版変換は backup.js が受け持つ。

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

// 1.2.0が出力していた復元列。読み戻しの互換のためだけに残し、出力には付けない。
const CSV_RESTORE_FORMAT = "booth-purchase-report-csv";
const CSV_RESTORE_HEADER = ["データバージョン", "復元用データ"];

// 数式として解釈され得る文字列セルには先頭にアポストロフィを付ける。
// 数値列には使わず負の金額も数値のまま出す。CSVから取り込むと、このアポストロフィは
// 商品名の一部として残る(元の文字列はバックアップJSONにだけ保持される)。
// 表計算アプリによる再保存後までの安全性を保証するものではない。
function csvText(value) {
  const text = value == null ? "" : String(value);
  return /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]|^[\u0000-\u001f\u007f-\u009f]/.test(text) ? `'${text}` : text;
}

// 1.2.0の復元列付きCSVの表示セルが編集されていないかを見るFNV-1a。認証や悪意ある
// 改ざんの防止には使えない。CSVの引用方法や行区切りだけの変更ではなく、復号したセルの内容を比較する。
function csvViewHash(header, rows) {
  const text = JSON.stringify([header, rows]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// 表示列だけのCSV。絞り込み中は末尾に集計対象の列を足し、それ以外の列は
// 足さない(外部ツールが列位置や行数に依存して読むため、補助行や巨大セルを出さない)。
function buildViewCsv(baseHeader, dataRows, mode) {
  const label = giftFilterCsvLabel(mode);
  const header = label ? [...baseHeader, GIFT_FILTER_CSV_COLUMN] : baseHeader;
  return toCsv([header, ...dataRows.map((row) => label ? [...row, label] : row)]);
}

// ヘッダーを含むstring[][]を返す。BOM・引用内改行・CRLF/LF/CRの行終端を扱う。
// 引用の途中開始、閉じ忘れ、閉じた引用に続く区切り以外の文字は拒否する。
function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += ch;
      continue;
    }
    if (ch === ",") {
      row.push(field); field = ""; closed = false;
    } else if (ch === "\r" || ch === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; closed = false;
      if (ch === "\r" && source[i + 1] === "\n") i++;
    } else if (ch === '"' && field === "" && !closed) {
      quoted = true;
    } else {
      if (closed || ch === '"') throw new Error(`CSVの引用符が不正です(${rows.length + 1}行目)。`);
      field += ch;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません。");
  if (row.length || field !== "" || closed) { row.push(field); rows.push(row); }
  return rows;
}

function csvLayout(header) {
  if (!header || new Set(header).size !== header.length) throw new Error("CSVの見出しが空か重複しています。");
  const restored = CSV_RESTORE_HEADER.every((value, i) => header[header.length - 2 + i] === value);
  const viewHeader = restored ? header.slice(0, -2) : header;
  const partial = viewHeader[viewHeader.length - 1] === GIFT_FILTER_CSV_COLUMN;
  const base = partial ? viewHeader.slice(0, -1) : viewHeader;
  const same = (expected) => expected.length === base.length && expected.every((value, i) => base[i] === value);
  const kind = same(ORDER_CSV_HEADER) ? "orders" : same(ITEM_CSV_HEADER) ? "items" : null;
  if (!kind) throw new Error("対応する注文CSV・商品CSVの見出しではありません。");
  return { restored, viewHeader, partial, kind };
}

function csvNumeric(value, label, integer = false) {
  if (value === "") return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
    throw new Error(`CSVの「${label}」は数値または空欄にしてください。`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && (!Number.isInteger(number) || number < 0))) {
    throw new Error(`CSVの「${label}」の数値が範囲外です。`);
  }
  return number;
}

// 表示列だけのCSVは、表に実在する情報だけを復元する。集計に使わない派生列や重複行も
// csvFactsに原型で残し、支払額・送料・元の取得範囲などを推測で補わない。
function parseLegacyCsv(header, rows, layout, fileName) {
  const cache = Object.create(null);
  const orders = new Map();
  const statuses = new Map(Object.entries(STATUS_LABELS).map(([key, label]) => [label, key]));
  for (const row of rows) {
    const values = Object.fromEntries(header.map((key, i) => [key, row[i]]));
    const id = values["注文番号"];
    if (!id) throw new Error("CSVに注文番号のない行があります。");
    const date = values["注文日時"];
    const status = statuses.get(values["ステータス"]) || values["ステータス"];
    if (!orders.has(id)) orders.set(id, { id, date, status });
    if (!Object.hasOwn(cache, id)) {
      cache[id] = { v: 1, amount: null, gift: null, shipping: null, date, status,
        items: null, ...(layout.partial ? { partialItems: true } : {}), csvFacts: [] };
    }
    const entry = cache[id];
    const first = entry.csvFacts.length === 0;
    entry.csvFacts.push({ kind: layout.kind, values });
    if (layout.kind === "orders") {
      const amount = csvNumeric(values["お支払金額"], "お支払金額");
      const gift = csvNumeric(values["ギフト額"], "ギフト額");
      const shipping = csvNumeric(values["送料"], "送料");
      csvNumeric(values["商品合計"], "商品合計");
      csvNumeric(values["差額"], "差額");
      csvNumeric(values["商品点数"], "商品点数", true);
      if (first && !layout.partial) Object.assign(entry, { amount, gift, shipping });
    } else {
      const missing = values["商品名"] === "(明細なし)" &&
        ["ショップ名", "ショップURL", "単価", "数量", "BOOST", "ギフト"].every((key) => values[key] === "");
      if (missing) continue;
      if (!["はい", "いいえ"].includes(values["ギフト"])) throw new Error("CSVのギフト列が不正です。");
      const item = {
        shop: values["ショップ名"], shopUrl: values["ショップURL"], name: values["商品名"],
        price: csvNumeric(values["単価"], "単価"), quantity: csvNumeric(values["数量"], "数量", true),
        boost: csvNumeric(values["BOOST"], "BOOST"), gift: values["ギフト"] === "はい",
      };
      if (entry.items === null) entry.items = [];
      entry.items.push(item);
      entry.gift = giftTotalOfItems(entry.items);
    }
  }
  const backup = buildBackup({ updatedAt: new Date().toISOString(), complete: false,
    orders: Array.from(orders.values()) }, cache);
  // ファイル名に版があればそれを使う。無版の旧1.0/1.1 CSVは見分けられないので、
  // 元版を創作せず旧JSONと同じ互換経路へ渡す。
  const namedVersion = fileDataVersion(fileName);
  if (namedVersion) backup.appVersion = namedVersion;
  else delete backup.appVersion;
  const result = parseBackup(JSON.stringify(backup), fileName);
  if (result.ok) result.warnings.push(layout.kind === "orders"
    ? "注文CSVの行を取り込みました。商品明細・取得範囲・手動割り当て・受取状況は復元できません。"
    : "商品CSVから明細を復元しました。お支払金額・送料・取得範囲・手動割り当て・受取状況は復元できません。");
  return result;
}

// JSONと既知形式のCSVを同じ取込結果へ変換する。受理できないファイルは理由付きで返す。
// 1.2.0の復元列があるCSVは表示行との一致も必須とし、不一致時に表示列だけの取込へ降格して読まない。
function parseImportFile(text, fileName = "") {
  try {
    const source = String(text).replace(/^\uFEFF/, "");
    if (/^[\s]*[\[{]/.test(source) || /\.json$/i.test(fileName)) return parseBackup(source, fileName);
    const [header, ...rows] = parseCsv(source);
    const layout = csvLayout(header);
    if (rows.some((row) => row.length !== header.length)) throw new Error("CSVの行と見出しの列数が一致しません。");
    const viewRows = layout.restored ? rows.map((row) => row.slice(0, -2)) : rows;
    if (layout.partial) {
      const labels = new Set(viewRows.filter((row) => row.some((value) => value !== "")).map((row) => row[row.length - 1]));
      if (labels.size > 1 || [...labels].some((label) => !["自分用", "ギフト"].includes(label))) {
        throw new Error("CSVの集計対象が不正か、複数の対象が混在しています。");
      }
    }
    let result;
    if (layout.restored) {
      const chunks = rows.map((row) => row[header.length - 1]).filter((value) => value !== "");
      if (!chunks.length) throw new Error("CSVの復元用データがありません。");
      const texts = chunks.map((chunk, i) => {
        const match = /^part (\d+)\/(\d+):([\s\S]*)$/.exec(chunk);
        if (!match || Number(match[1]) !== i + 1 || Number(match[2]) !== chunks.length) {
          throw new Error("CSVの復元用データが欠けているか、順番が変わっています。");
        }
        return match[3];
      });
      const payload = parseDataJson(texts.join(""));
      if (!isObject(payload)) {
        throw new Error("CSVの復元用データの形式が不正です。");
      }
      if (!isObject(payload) || payload.format !== CSV_RESTORE_FORMAT ||
          typeof payload.appVersion !== "string" || !isObject(payload.backup)) {
        throw new Error("CSVの復元用データの形式が不正です。");
      }
      validateDataVersion(payload.appVersion, fileName);
      if (rows.some((row) => row[header.length - 2] !== payload.appVersion) ||
          payload.backup.appVersion !== payload.appVersion) throw new Error("CSV内のデータバージョンが一致しません。");
      if (payload.viewHash !== csvViewHash(layout.viewHeader, viewRows)) {
        throw new Error("CSVの表示セルが復元用データと一致しません。編集前のファイルを読み込んでください。");
      }
      result = parseBackup(JSON.stringify(payload.backup), fileName);
    } else result = parseLegacyCsv(header, rows, layout, fileName);
    if (result.ok && layout.partial) result.warnings.push("部分集計のCSVです。注文全体のお支払金額・送料は復元しません。");
    return result;
  } catch (error) {
    return { ok: false, message: error.message || "ファイルを読み取れませんでした。" };
  }
}
