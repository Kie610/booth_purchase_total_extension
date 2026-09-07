"use strict";

// JSON/CSVの移行契約を実関数で検証する。fixtureは架空の注文だけを使い、
// ブラウザ・ストレージ・ネットワークにはアクセスしない。
// 旧形式の根拠: v1.0.0 (7e884d2) / v1.1.0 (67f206d) の
// extension/backup.js、csv.js、dashboard-parse.js。生成側を期待値の算出に使わない。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  console, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
  Date, setTimeout, clearTimeout, atob, btoa,
  browser: { runtime: { getManifest: () => ({ version: "1.2.0" }) } },
});
for (const file of ["avatar-master.js", "common.js", "csv.js", "backup.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "extension", file), "utf8"), context, {
    filename: `extension/${file}`,
  });
}

const tests = [];
function check(name, run) { tests.push({ name, run }); }
function invoke(name, ...args) {
  if (vm.runInContext(`typeof ${name}`, context) !== "function") assert.fail(`未実装API: ${name}`);
  return vm.runInContext(name, context)(...args);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function domain(value) {
  return clone({
    index: value.index ?? null,
    cache: value.cache ?? {},
    avatarAssign: value.avatarAssign ?? {},
    giftStatus: value.giftStatus ?? {},
  });
}
function imported(text, fileName) {
  const result = invoke("parseImportFile", text, fileName);
  assert.equal(result.ok, true, result.message || "取り込みが拒否された");
  assert.ok(Array.isArray(result.warnings), "warningsは文字列配列で返す");
  assert.ok(result.warnings.every((warning) => typeof warning === "string"));
  return result;
}
function rejected(text, fileName) {
  const result = invoke("parseImportFile", text, fileName);
  assert.equal(result.ok, false, "不正入力を受理しない");
  assert.equal(typeof result.message, "string");
  assert.ok(result.message.length > 0, "拒否理由を返す");
}

const DATE_TEXT = "2026年1月1日 12:00";
const EXPORTED_AT = "2026-01-02T00:00:00.000Z";
const EXPORT_DATE = new Date(2026, 0, 2, 12, 0, 0);
const SHOP_URL = "https://example.booth.pm/";
const PRODUCT_KEY = `${SHOP_URL} / 服`;
const GIFT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ORPHAN_GIFT_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const OLD_ITEM = {
  shop: "例", shopUrl: SHOP_URL, name: "服 (マヌカ)",
  price: 500, quantity: 2, boost: 100, gift: false,
};
const OLD_ENTRY = {
  v: 1, amount: 1300, gift: 0, status: "paid", date: DATE_TEXT,
  shipping: 200, items: [OLD_ITEM],
};
const OLD_INDEX = {
  updatedAt: EXPORTED_AT, complete: true,
  orders: [{ id: "1001", status: "paid", date: DATE_TEXT }],
};
function oldBackup(withAssignment = false) {
  const backup = {
    format: "booth-purchase-report", version: 1, exportedAt: EXPORTED_AT,
    index: clone(OLD_INDEX), cache: { "1001": clone(OLD_ENTRY) },
  };
  if (withAssignment) backup.avatarAssign = { [PRODUCT_KEY]: "manuka" };
  return backup;
}

const ORDER_HEADER = "注文番号,注文日時,ステータス,お支払金額,ギフト額,商品合計,送料,差額,商品点数";
const ITEM_HEADER = "注文番号,注文日時,ステータス,ショップ名,ショップURL,商品名,単価,数量,BOOST,ギフト";
const ORDER_ROW = `1001,${DATE_TEXT},支払済み,1300,0,1100,200,0,1`;
const ITEM_ROW = `1001,${DATE_TEXT},支払済み,例,${SHOP_URL},服 (マヌカ),500,2,100,いいえ`;
const OLD_ORDERS_CSV = `\uFEFF${ORDER_HEADER}\r\n${ORDER_ROW}\r\n`;
const OLD_ITEMS_CSV = `\uFEFF${ITEM_HEADER}\r\n${ITEM_ROW}\r\n`;

// 表示対象にない取消注文・索引外cache・未収集注文・孤立した割り当てとメモを
// 同時に含める。CSVの可視行だけを復元元にすると、これらのどれかが失われる。
const FULL_DOMAIN = {
  index: {
    updatedAt: EXPORTED_AT, complete: false,
    orders: [
      { id: "1001", status: "paid", date: DATE_TEXT },
      { id: "1002", status: "cancelled", date: DATE_TEXT },
      { id: "1004", status: "unpaid", date: DATE_TEXT },
    ],
  },
  cache: {
    "1001": {
      ...clone(OLD_ENTRY), v: 2, gift: 1100,
      items: [{ ...clone(OLD_ITEM), gift: true, giftId: GIFT_ID }],
    },
    "1002": {
      ...clone(OLD_ENTRY), v: 2, amount: 2000, status: "cancelled",
      items: [{ ...clone(OLD_ITEM), name: "取消商品の保存", price: 1800, quantity: 1, boost: 0 }],
    },
    "1003": { ...clone(OLD_ENTRY), amount: 0, status: "completed", shipping: 0, items: [] },
  },
  avatarAssign: { [PRODUCT_KEY]: "manuka", "旧ショップ / 保存名": "__multi__" },
  giftStatus: {
    [GIFT_ID]: {
      state: "unreceived", issuedAt: DATE_TEXT, receivedAt: null,
      checkedAt: EXPORTED_AT, memo: '自分用メモ,\n"確認"',
    },
    [ORPHAN_GIFT_ID]: {
      state: "received", issuedAt: DATE_TEXT, receivedAt: DATE_TEXT,
      checkedAt: EXPORTED_AT, memo: "注文削除後にも残るメモ",
    },
  },
};
const VISIBLE_RESULTS = [{ id: "1001", ...clone(FULL_DOMAIN.cache["1001"]) }];

function builtBackup(data = FULL_DOMAIN) {
  const source = clone(data);
  return invoke("buildBackup", source.index, source.cache, EXPORT_DATE,
    source.avatarAssign, source.giftStatus, source.migrationConflicts);
}
function rawModernBackup(data = FULL_DOMAIN) {
  return {
    format: "booth-purchase-report", version: 1, appVersion: "1.2.0",
    exportedAt: EXPORTED_AT, ...clone(data),
  };
}
function newCsv(kind, data = FULL_DOMAIN, rows = VISIBLE_RESULTS) {
  return invoke(kind === "orders" ? "buildOrdersCsv" : "buildItemsCsv", clone(rows), "all", builtBackup(data));
}
function emptyDomain() { return { index: null, cache: {}, avatarAssign: {}, giftStatus: {} }; }
function merge(current, incoming) {
  return invoke("mergeBackup", clone(current), clone(incoming), new Date(EXPORTED_AT));
}
function legacyItemFields(items) {
  assert.ok(Array.isArray(items));
  return clone(items.map(({ shop, shopUrl, name, price, quantity, boost, gift }) =>
    ({ shop, shopUrl, name, price, quantity, boost, gift })));
}
function assertComplemented(result) {
  assert.equal(result.index.orders.length, 1);
  assert.equal(result.index.orders[0].id, "1001");
  assert.equal(result.cache["1001"].amount, 1300, "注文CSVのお支払金額を残す");
  assert.equal(result.cache["1001"].shipping, 200);
  assert.equal(result.cache["1001"].gift, 0);
  assert.deepEqual(legacyItemFields(result.cache["1001"].items), [OLD_ITEM], "商品CSVの明細で補う");
  assert.equal(result.index.complete, false, "CSVだけで履歴の完全性を保証しない");
}

check("v1.0.0 JSONの金額・数量・BOOST・cache版数を保持する", () => {
  const legacy = oldBackup();
  const result = imported(JSON.stringify(legacy), "booth-backup-20260102.json");
  assert.deepEqual(domain(result), domain(legacy));
  assert.equal(result.cache["1001"].v, 1, "取り込むだけでcache v2へ昇格しない");
});

check("v1.1.0 JSONの手動割り当てを保持する", () => {
  const legacy = oldBackup(true);
  const result = imported(JSON.stringify(legacy), "booth-backup-20260102.json");
  assert.deepEqual(domain(result), domain(legacy));
});

check("新出力名にはアプリ版を含め、部分CSVは対象も明示する", () => {
  assert.equal(invoke("backupFileName", EXPORT_DATE), "booth-backup-1.2.0-20260102.json");
  assert.equal(invoke("csvFileName", "orders", EXPORT_DATE), "booth-orders-1.2.0-20260102.csv");
  assert.equal(invoke("csvFileName", "items", EXPORT_DATE, "gift"), "booth-items-gift-1.2.0-20260102.csv");
});

check("旧注文CSV単体は支払額を復元し、存在しない明細を作らない", () => {
  const result = imported(OLD_ORDERS_CSV, "booth-orders-20260102.csv");
  const entry = result.cache["1001"];
  assert.equal(entry.amount, 1300);
  assert.equal(entry.shipping, 200);
  assert.equal(entry.gift, 0);
  assert.equal(entry.items, null);
  assert.equal(result.index.complete, false);
  assert.ok(result.warnings.length > 0, "旧CSVの欠落情報を通知する");
});

check("旧商品CSV単体は明細を復元し、商品合計を支払額にしない", () => {
  const result = imported(OLD_ITEMS_CSV, "booth-items-20260102.csv");
  const entry = result.cache["1001"];
  assert.deepEqual(legacyItemFields(entry.items), [OLD_ITEM]);
  assert.equal(entry.amount, null);
  assert.ok(entry.shipping == null, "商品CSVにない送料を0円確定にしない");
  assert.equal(result.index.complete, false);
});

check("旧CSVの状態5種・注文日時・先頭ゼロ付き注文IDを保持する", () => {
  const rows = [
    `001,${DATE_TEXT},発送完了,0,0,0,0,0,0`,
    `002,${DATE_TEXT},支払済み,0,0,0,0,0,0`,
    `003,${DATE_TEXT},未払い,0,0,0,0,0,0`,
    `004,${DATE_TEXT},キャンセル,0,0,0,0,0,0`,
    `005,${DATE_TEXT},不明,0,0,0,0,0,0`,
  ];
  const result = imported(`${ORDER_HEADER}\n${rows.join("\n")}`, "booth-orders-20260102.csv");
  assert.deepEqual(clone(result.index.orders.map(({ id, status, date }) => [id, status, date])), [
    ["001", "completed", DATE_TEXT], ["002", "paid", DATE_TEXT], ["003", "unpaid", DATE_TEXT],
    ["004", "cancelled", DATE_TEXT], ["005", "unknown", DATE_TEXT],
  ]);
});

check("旧注文CSVの空欄を0円へ変換せず、正常な0円は保持する", () => {
  const csv = `${ORDER_HEADER}\r\n` +
    `1001,${DATE_TEXT},支払済み,0,0,0,0,0,0\r\n` +
    `1002,${DATE_TEXT},支払済み,,,,,,`;
  const result = imported(csv, "booth-orders-20260102.csv");
  assert.equal(result.cache["1001"].amount, 0);
  assert.equal(result.cache["1002"].amount, null);
  assert.ok(result.cache["1002"].shipping == null);
});

check("旧商品CSVの未知の数量・BOOSTを1個や0円で埋めない", () => {
  const csv = `${ITEM_HEADER}\r\n1001,${DATE_TEXT},支払済み,例,${SHOP_URL},不明明細,500,,,はい`;
  const result = imported(csv, "booth-items-20260102.csv");
  const item = result.cache["1001"].items[0];
  assert.equal(item.quantity, null);
  assert.equal(item.boost, null);
  assert.equal(item.gift, true);
  assert.equal(result.cache["1001"].amount, null);
});

check("CSVの引用符・区切り文字・セル内改行を商品名として保持する", () => {
  const csv = `${ITEM_HEADER}\r\n` +
    `1001,${DATE_TEXT},支払済み,"例,ショップ","${SHOP_URL}","服 ""A""\r\n続き",500,2,100,いいえ\r\n`;
  const result = imported(csv, "booth-items-20260102.csv");
  assert.equal(result.cache["1001"].items[0].shop, "例,ショップ");
  assert.equal(result.cache["1001"].items[0].name, '服 "A"\r\n続き');
});

check("注文CSVの後に商品CSVを取り込むと支払額と明細を相互補完する", () => {
  const orders = imported(OLD_ORDERS_CSV, "booth-orders-20260102.csv");
  const items = imported(OLD_ITEMS_CSV, "booth-items-20260102.csv");
  assertComplemented(merge(merge(emptyDomain(), orders), items));
});

check("商品CSVの後に注文CSVを取り込んでも同じ情報が残る", () => {
  const orders = imported(OLD_ORDERS_CSV, "booth-orders-20260102.csv");
  const items = imported(OLD_ITEMS_CSV, "booth-items-20260102.csv");
  const forward = merge(merge(emptyDomain(), orders), items);
  const reverse = merge(merge(emptyDomain(), items), orders);
  assertComplemented(forward);
  assertComplemented(reverse);
});

check("同じ旧CSVを再度取り込んでも注文・商品が増殖しない", () => {
  const orders = imported(OLD_ORDERS_CSV, "booth-orders-20260102.csv");
  const items = imported(OLD_ITEMS_CSV, "booth-items-20260102.csv");
  const once = merge(merge(emptyDomain(), orders), items);
  const repeated = merge(merge(once, orders), items);
  assertComplemented(repeated);
  assert.deepEqual(domain(repeated), domain(once));
});

check("旧部分注文CSVの表示用合計を注文のお支払金額にしない", () => {
  const csv = `${ORDER_HEADER},集計対象\r\n1001,${DATE_TEXT},支払済み,1100,1100,1100,0,0,1,ギフト`;
  const result = imported(csv, "booth-orders-gift-20260102.csv");
  assert.equal(result.cache["1001"].amount, null);
  assert.equal(result.cache["1001"].items, null);
  assert.equal(result.index.complete, false);
  assert.ok(result.warnings.length > 0);
});

check("旧部分商品CSVは部分明細を保ち、注文全体の金額を作らない", () => {
  const csv = `${ITEM_HEADER},集計対象\r\n1001,${DATE_TEXT},支払済み,例,${SHOP_URL},贈り物,500,2,100,はい,ギフト`;
  const result = imported(csv, "booth-items-gift-20260102.csv");
  assert.equal(result.cache["1001"].amount, null);
  assert.equal(result.cache["1001"].items.length, 1);
  assert.equal(result.cache["1001"].items[0].gift, true);
  assert.equal(result.index.complete, false);
  assert.ok(result.warnings.length > 0);
});

check("未知ヘッダーと壊れたJSONを理由付きで拒否する", () => {
  rejected("日付,金額\n2026-01-01,500", "booth-orders-20260102.csv");
  rejected('{"format":', "booth-backup-20260102.json");
  rejected(`${ITEM_HEADER}\n"1001`, "booth-items-20260102.csv");
  rejected(`${ITEM_HEADER}\n1001,${DATE_TEXT},支払済み,例,${SHOP_URL},服"壊れた引用,500,2,100,いいえ`, "booth-items-20260102.csv");
  rejected(`${ITEM_HEADER}\n"1001"x,${DATE_TEXT},支払済み,例,${SHOP_URL},服,500,2,100,いいえ`, "booth-items-20260102.csv");
  rejected(`${ORDER_HEADER},注文番号\n${ORDER_ROW},1001`, "booth-orders-20260102.csv");
  rejected(`${ORDER_HEADER}\n1001,${DATE_TEXT}`, "booth-orders-20260102.csv");
});

check("新JSONは取消・索引外cache・未収集・割り当て・メモを往復する", () => {
  const backup = builtBackup();
  assert.equal(backup.appVersion, "1.2.0");
  assert.equal(backup.version, 1, "アプリ版とバックアップ構造版を混同しない");
  const result = imported(JSON.stringify(backup), invoke("backupFileName", EXPORT_DATE));
  assert.deepEqual(domain(result), FULL_DOMAIN);
  assert.equal(result.appVersion, "1.2.0");
});

check("parseBackupの既存呼び出しで旧JSONも新JSONも読み込める", () => {
  const legacy = oldBackup(true);
  const oldResult = invoke("parseBackup", JSON.stringify(legacy));
  assert.equal(oldResult.ok, true);
  assert.deepEqual(domain(oldResult), domain(legacy));
  const modern = rawModernBackup();
  const newResult = invoke("parseBackup", JSON.stringify(modern), "booth-backup-1.2.0-20260102.json");
  assert.equal(newResult.ok, true);
  assert.deepEqual(domain(newResult), FULL_DOMAIN);
});

check("新注文CSVは可視行から落ちた保存データもsourceBackupから復元する", () => {
  const result = imported(newCsv("orders"), invoke("csvFileName", "orders", EXPORT_DATE));
  assert.deepEqual(domain(result), FULL_DOMAIN);
});

check("新商品CSVは可視行から落ちた保存データもsourceBackupから復元する", () => {
  const result = imported(newCsv("items"), invoke("csvFileName", "items", EXPORT_DATE));
  assert.deepEqual(domain(result), FULL_DOMAIN);
});

check("注文0件の新CSVでも残っている手動割り当てとメモを復元する", () => {
  const empty = {
    index: null, cache: {},
    avatarAssign: clone(FULL_DOMAIN.avatarAssign), giftStatus: clone(FULL_DOMAIN.giftStatus),
  };
  for (const kind of ["orders", "items"]) {
    const result = imported(newCsv(kind, empty, []), invoke("csvFileName", kind, EXPORT_DATE));
    assert.deepEqual(domain(result), empty, kind);
  }
});

check("新CSVの先頭列は従来の列順・商品BOOST・数値表現を保つ", () => {
  const orderLines = newCsv("orders").replace(/^\uFEFF/, "").split("\r\n");
  assert.ok(orderLines[0].startsWith(`${ORDER_HEADER},`), "復元列は注文の既存列より後に置く");
  assert.ok(orderLines[1].startsWith(`1001,${DATE_TEXT},支払済み,1300,1100,1100,200,0,1,`));
  const itemLines = newCsv("items").replace(/^\uFEFF/, "").split("\r\n");
  assert.ok(itemLines[0].startsWith(`${ITEM_HEADER},`), "復元列は商品の既存列より後に置く");
  assert.ok(itemLines[1].startsWith(`1001,${DATE_TEXT},支払済み,例,${SHOP_URL},服 (マヌカ),500,2,100,はい,`));
});

check("未来アプリ版のJSONとCSVファイル名を拒否する", () => {
  const future = rawModernBackup();
  future.appVersion = "99.0.0";
  rejected(JSON.stringify(future), "booth-backup-99.0.0-20260102.json");
  rejected(newCsv("orders"), "booth-orders-99.0.0-20260102.csv");
});

check("JSONとCSVのファイル名と内容の版が一致しない場合は拒否する", () => {
  rejected(JSON.stringify(rawModernBackup()), "booth-backup-1.1.0-20260102.json");
  rejected(newCsv("orders"), "booth-orders-1.1.0-20260102.csv");
});

check("giftIdへ文字列でない値を入れたJSONを保存前に拒否する", () => {
  for (const invalid of [{ toString: null }, [], 7, true]) {
    const backup = rawModernBackup();
    backup.cache["1001"].items[0].giftId = invalid;
    rejected(JSON.stringify(backup), "booth-backup-1.2.0-20260102.json");
  }
});

check("新形式を併合してもgiftStatusと割り当てが消えずcache v1を維持する", () => {
  const incoming = imported(JSON.stringify(rawModernBackup()), "booth-backup-1.2.0-20260102.json");
  const result = merge(emptyDomain(), incoming);
  assert.deepEqual(domain(result), FULL_DOMAIN);
  assert.equal(result.cache["1003"].v, 1);
  assert.deepEqual(domain(merge(result, incoming)), FULL_DOMAIN);
});

check("新CSVの表示セルを編集したら古い復元payloadを黙って使わない", () => {
  const csv = newCsv("orders");
  rejected(csv.replace("支払済み", "未払い"), "booth-orders-1.2.0-20260102.csv");
});

check("文字列の数式開始を抑制し、負の金額と復元時の元文字列を保持する", () => {
  const source = domain(FULL_DOMAIN);
  source.cache["1001"] = {
    ...clone(OLD_ENTRY), amount: -1200, shipping: 0,
    items: ["=1+1", "+1+2", "-1+2", "@SUM(1)", "\t=1+1", " =1+1", "\u0085=1+1"].map((name) =>
      ({ ...clone(OLD_ITEM), name, price: -100, quantity: 2, boost: 0 })),
  };
  const rows = [{ id: "1001", ...clone(source.cache["1001"]) }];
  const csv = newCsv("items", source, rows);
  for (const prefix of ["'=1+1", "'+1+2", "'-1+2", "'@SUM(1)", "'\t=1+1", "' =1+1", "'\u0085=1+1"]) {
    assert.ok(csv.includes(`,${prefix},-100,2,0,`), `文字列は保護し金額は数値にする: ${JSON.stringify(prefix)}`);
  }
  assert.deepEqual(domain(imported(csv, "booth-items-1.2.0-20260102.csv")), source);
});

check("旧商品CSVの同内容2行は別明細として残し、原行も2件保存する", () => {
  const csv = `${ITEM_HEADER}\r\n${ITEM_ROW}\r\n${ITEM_ROW}\r\n`;
  const result = imported(csv, "booth-items-20260102.csv");
  assert.deepEqual(legacyItemFields(result.cache["1001"].items), [OLD_ITEM, OLD_ITEM]);
  assert.equal(result.cache["1001"].csvFacts.length, 2);
  assert.equal(result.cache["1001"].csvFacts[0].kind, "items");
  assert.equal(result.cache["1001"].csvFacts[0].values["BOOST"], "100");
});

check("新部分CSVは該当明細と関連メモ・割り当てだけを持ち出す", () => {
  const source = domain(FULL_DOMAIN);
  source.cache["1001"].items.push({ ...clone(OLD_ITEM), name: "自分用", gift: false });
  source.migrationConflicts = {
    avatarAssign: { [PRODUCT_KEY]: ["shinano"], "旧ショップ / 保存名": ["manuka"] },
    giftStatus: {
      [GIFT_ID]: [{ ...clone(source.giftStatus[GIFT_ID]), memo: "関連する別メモ" }],
      [ORPHAN_GIFT_ID]: [{ ...clone(source.giftStatus[ORPHAN_GIFT_ID]), memo: "対象外の別メモ" }],
    },
  };
  for (const kind of ["orders", "items"]) {
    const csv = invoke(kind === "orders" ? "buildOrdersCsv" : "buildItemsCsv",
      [{ id: "1001", ...clone(source.cache["1001"]) }], "gift", builtBackup(source));
    const result = imported(csv, `booth-${kind}-gift-1.2.0-20260102.csv`);
    assert.deepEqual(Object.keys(result.cache), ["1001"]);
    assert.equal(result.cache["1001"].amount, null);
    assert.equal(result.cache["1001"].shipping, null);
    assert.equal(result.cache["1001"].partialItems, true);
    assert.equal(result.cache["1001"].items.length, 1);
    assert.equal(result.cache["1001"].items[0].gift, true);
    assert.equal(result.index.complete, false);
    assert.deepEqual(Object.keys(result.giftStatus), [GIFT_ID]);
    assert.deepEqual(Object.keys(result.avatarAssign), [PRODUCT_KEY]);
    assert.deepEqual(Object.keys(result.migrationConflicts.avatarAssign), [PRODUCT_KEY]);
    assert.deepEqual(Object.keys(result.migrationConflicts.giftStatus), [GIFT_ID]);
  }
});

check("新全件CSVはcheckedAtの数値と文字列および競合記録を保持する", () => {
  const source = domain(FULL_DOMAIN);
  source.giftStatus[ORPHAN_GIFT_ID].checkedAt = 1767312000000;
  source.migrationConflicts = {
    avatarAssign: { [PRODUCT_KEY]: ["shinano"] },
    giftStatus: { [GIFT_ID]: [{ ...clone(source.giftStatus[GIFT_ID]), memo: "別の保存値" }] },
  };
  for (const kind of ["orders", "items"]) {
    const result = imported(newCsv(kind, source), `booth-${kind}-1.2.0-20260102.csv`);
    assert.deepEqual(domain(result), domain(source));
    assert.deepEqual(clone(result.migrationConflicts), source.migrationConflicts);
  }
});

check("保存形式の版はmanifest版と一致し、旧版を順に変換する", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
  assert.equal(vm.runInContext("DATA_VERSION", context), manifest.version);
  const calls = vm.runInContext(`(() => {
    const calls = [];
    const first = DATA_MIGRATIONS["1.0.0"], second = DATA_MIGRATIONS["1.1.0"];
    DATA_MIGRATIONS["1.0.0"] = data => { calls.push("1.0.0"); return first(data); };
    DATA_MIGRATIONS["1.1.0"] = data => { calls.push("1.1.0"); return second(data); };
    try { parseBackup(JSON.stringify({format:BACKUP_FORMAT,version:1,exportedAt:new Date().toISOString(),index:null,cache:{}})); }
    finally { DATA_MIGRATIONS["1.0.0"] = first; DATA_MIGRATIONS["1.1.0"] = second; }
    return calls;
  })()`, context);
  assert.deepEqual(clone(calls), ["1.0.0", "1.1.0"]);
});

check("部分明細と完全明細が食い違っても両方の既知値を保存する", () => {
  const current = {amount:300,v:2,partialItems:true,items:[{...clone(OLD_ITEM),price:100}]};
  const incoming = {amount:300,v:2,partialItems:false,items:[{...clone(OLD_ITEM),price:200}]};
  const result = invoke("mergeCacheEntry", current, incoming);
  const prices = [result, ...(result.importedAlternatives || [])].flatMap(entry => entry.items.map(item => item.price));
  assert.ok(prices.includes(100) && prices.includes(200));
});

check("採用していない明細の収集版へ昇格しない", () => {
  const current = {amount:300,v:0,items:[clone(OLD_ITEM)]};
  const incoming = {amount:300,v:2,items:[clone(OLD_ITEM),{...clone(OLD_ITEM),name:"B"}]};
  const result = invoke("mergeCacheEntry", current, incoming);
  assert.equal(result.v,0); assert.equal(invoke("needsCollect",result),true);
});

check("同名の複数明細は既知価格を先に対応し、URL追加だけで重複しない", () => {
  const item = price => ({shop:"S",name:"A",price,quantity:1,boost:0,gift:false});
  const entry = items => ({amount:300,v:2,partialItems:true,items});
  const result = invoke("mergeCacheEntry",entry([item(null),item(200)]),entry([item(200),item(100)]));
  assert.deepEqual(clone(result.items.map(item=>item.price)),[100,200]);
  assert.equal(invoke("mergeCacheEntry",entry([item(100)]),entry([{...item(100),shopUrl:"https://s.booth.pm"}])).items.length,1);
});

check("不正な退避情報と旧項目を消して受理しない", () => {
  const malformed = rawModernBackup(); malformed.migrationConflicts={giftStatus:{x:7}};
  rejected(JSON.stringify(malformed),"booth-backup-1.2.0-20260102.json");
  const index = rawModernBackup(); index.index.orders[0].importedAlternatives=7;
  rejected(JSON.stringify(index),"booth-backup-1.2.0-20260102.json");
  const legacy = oldBackup(); legacy.appVersion="1.0.0"; legacy.avatarAssign=false; legacy.giftStatus=0;
  rejected(JSON.stringify(legacy),"booth-backup-1.0.0-20260102.json");
});

check("成功データで復元できた取得失敗は再取得対象に残さない", () => {
  const result=invoke("mergeCacheEntry",{amount:null,items:null,collectionFailed:true,v:2},
    {amount:1300,items:[clone(OLD_ITEM)],v:2});
  assert.equal(invoke("needsCollect",result),false);
});

check("長いメモをセル上限内で分割し、欠けた断片は拒否する", () => {
  const source=clone(FULL_DOMAIN);
  source.giftStatus[GIFT_ID].memo="長いメモ😀".repeat(8000);
  const csv=newCsv("orders",source);
  const rows=invoke("parseCsv",csv);
  assert.ok(rows.slice(1).every(row=>row.at(-1).length<32767));
  assert.deepEqual(domain(imported(csv,"booth-orders-1.2.0-20260102.csv")),source);
  rows[2][rows[2].length-1]="";
  rejected(invoke("toCsv",rows),"booth-orders-1.2.0-20260102.csv");
});

let passed = 0;
let failed = 0;
for (const test of tests) {
  try {
    test.run();
    passed++;
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${test.name}\n${error.message}`);
  }
}
console.log(JSON.stringify({ total: tests.length, passed, failed }));
process.exitCode = failed === 0 ? 0 : 1;
