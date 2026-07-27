"use strict";

// Chrome / Firefox 両対応のための簡易ラッパー
const ext = typeof browser !== "undefined" ? browser : chrome;

// { [orderId]: { amount, gift, status, date, items: [{ shop, shopUrl, name, price, boost, gift }] } }
const CACHE_KEY = "boothOrderCache";
const INDEX_KEY = "boothOrderIndex"; // { updatedAt, orders: [{ id, status, date }] }
const SUMMARY_KEY = "boothSummary"; // 最後に完了した集計の要約(ポップアップ表示用)
const RUN_STATE_KEY = "boothRunState"; // 実行中の進捗(ポップアップから覗くため)
const DASHBOARD_TAB_KEY = "boothDashboardTab"; // 集計ページのタブID

const STATUS_LABELS = {
  completed: "発送完了",
  paid: "支払済み",
  unpaid: "未払い",
  cancelled: "キャンセル",
  unknown: "不明",
};

function formatYen(n) {
  return `¥${Number(n).toLocaleString("ja-JP")}`;
}

// 支払額に含まれるギフト分。取得できていない注文では0として扱う
function giftAmount(entry) {
  return entry && typeof entry.gift === "number" ? entry.gift : 0;
}

// ---- 商品明細 ----------------------------------------------------------
//
// 注文は「ショップ名・商品名・単価・BOOST・ギフトかどうか」を持つ商品の集まりとして
// 保存する。合計や年別月別の集計は引き続き注文単位の「お支払金額」から出し、
// 商品の合計では代用しない(送料やクーポンが絡む注文で一致する保証が無いため)。
// 両者の差は「データ出力」のCSVで確認できるようにしてある。

function hasItems(entry) {
  return Boolean(entry) && Array.isArray(entry.items);
}

// 数量の行はデジタル商品の注文には無い。無ければ1個として数える
function itemQuantity(item) {
  return item.quantity === undefined ? 1 : item.quantity;
}

// 商品の金額は「単価×数量」にBOOSTを足したもの。BOOSTは行に1つ付くものとして
// 数量を掛けない(数量が2以上でBOOSTのある注文をまだ実測できていない。
// 掛け方を誤っていればお支払金額との差額に出る)。
// 1件でも価格や数量を読めていなければ、足りない分を0として扱うと
// 少ない額を正しい合計に見せてしまうので不明(null)にする
function sumItemAmounts(items) {
  if (!Array.isArray(items)) return null;
  let total = 0;
  for (const item of items) {
    const quantity = itemQuantity(item);
    if (typeof item.price !== "number" || typeof quantity !== "number") return null;
    total += item.price * quantity + (typeof item.boost === "number" ? item.boost : 0);
  }
  return total;
}

// ギフトのグループに置かれていた商品の合計。明細そのものが無ければ不明
function giftTotalOfItems(items) {
  if (!Array.isArray(items)) return null;
  return sumItemAmounts(items.filter((item) => item.gift));
}

function itemsTotalOf(entry) {
  return hasItems(entry) ? sumItemAmounts(entry.items) : null;
}

// 配送のある注文に付く送料。取得できていない注文では0として扱う
function shippingAmount(entry) {
  return entry && typeof entry.shipping === "number" ? entry.shipping : 0;
}

// お支払金額から、商品合計と送料を引いた残り。クーポンやポイントなど、
// まだ拾えていないものがあればここに出る。
// お支払金額か商品合計が不明なら差も出さない
function amountGapOf(entry) {
  const items = itemsTotalOf(entry);
  if (items === null || !entry || typeof entry.amount !== "number") return null;
  return entry.amount - items - shippingAmount(entry);
}

// まだ取りに行く必要がある注文かどうか。キャッシュに無いもの(未収集)に加え、
// 取得はできたが金額を読めなかったもの(amount:null)、商品明細を読めなかったものも
// 対象にする。対象から外すと強制再取得でしか拾い直せず、内訳に「取得失敗」と
// 出たまま直す手段が全件再取得しかなくなるため、次の実行で自動的に取り直せるようにする
function needsCollect(entry) {
  return !entry || entry.amount === null || !hasItems(entry);
}

// 索引が最古の注文まで到達できているか。
// v1.2以前はフラグを持たないが、全ページの巡回に成功したときだけ索引を保存していたため
// 「最古まで取得済み」として扱ってよい
function indexIsComplete(index) {
  return Boolean(index) && index.complete !== false;
}

// 支払額の左に小さく添えるギフト表記(0のときは何も出さない)
function giftText(total) {
  return total > 0 ? `ギフト ${formatYen(total)}` : "";
}

// ポップアップの件数行。取得失敗だけは要対処なので色を分けて出したく、
// 別の要素にする必要があるため文面を分けて返す
function summaryCounts(summary) {
  return {
    text:
      `収集済み: ${summary.count}件` +
      (summary.pendingCount ? ` / 未収集: ${summary.pendingCount}件` : "") +
      (summary.skippedCancelled
        ? ` / 除外(キャンセル): ${summary.skippedCancelled}件`
        : ""),
    failed: summary.failedCount ? ` / 取得失敗: ${summary.failedCount}件` : "",
  };
}

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP");
}

// BOOTHの注文日時は表記が変わりうるため、
// "2024年5月3日 12:34" / "2024/05/03" / "2024-05-03" のいずれも受け付ける
function parseOrderDate(text) {
  if (!text) return null;
  const m = String(text).match(
    /(\d{4})\s*[-/年.]\s*(\d{1,2})(?:\s*[-/月.]\s*(\d{1,2}))?/
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 0;
  if (month < 1 || month > 12) return null;
  return { year, month, day, sortKey: year * 10000 + month * 100 + day };
}

// 日付が読めなかった注文は末尾へ送る
function orderSortKey(order) {
  const d = parseOrderDate(order.date);
  return d ? d.sortKey : -1;
}

// ---- 期間(年・月)のまとめ ----------------------------------------------
//
// 期間キーは "YYYY-MM"(月) / "YYYY"(年) の文字列で統一する。0埋めしてあるので
// 文字列比較がそのまま日付の前後関係になり、範囲指定の比較にもそのまま使える。
// 日付を読み取れなかった注文のキーは null。

function monthKeyOf(dateText) {
  const d = parseOrderDate(dateText);
  return d ? `${d.year}-${String(d.month).padStart(2, "0")}` : null;
}

function yearKeyOf(monthKey) {
  return monthKey ? monthKey.slice(0, 4) : null;
}

function yearLabel(key) {
  return key ? `${Number(key)}年` : "日付不明";
}

function monthLabel(key) {
  if (!key) return "日付不明";
  const [year, month] = key.split("-");
  return `${Number(year)}年${Number(month)}月`;
}

// 年の行にぶら下げるときの月表記(年は親の行に出ているので省く)
function monthShortLabel(key) {
  return key ? `${Number(key.slice(5))}月` : "月不明";
}

// 新しい順。日付不明(null)は並びの末尾へ送る
function comparePeriodDesc(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

// 注文を「年 → 月」の二段階にまとめる共通処理。
// 行に何を積むかは呼び出し側が seed(行の初期値)と add(1件分の反映)で決める。
// 「収集状況を数える」用途と「支払額を合計する」用途の両方がこれを使う。
function groupByPeriod(items, dateOf, seed, add) {
  const years = new Map();
  for (const item of items) {
    const monthKey = monthKeyOf(dateOf(item));
    const yearKey = yearKeyOf(monthKey);
    if (!years.has(yearKey)) {
      years.set(yearKey, {
        key: yearKey,
        label: yearLabel(yearKey),
        months: new Map(),
        ...seed(),
      });
    }
    const year = years.get(yearKey);
    add(year, item);

    if (!year.months.has(monthKey)) {
      year.months.set(monthKey, {
        key: monthKey,
        label: monthLabel(monthKey),
        shortLabel: monthShortLabel(monthKey),
        ...seed(),
      });
    }
    add(year.months.get(monthKey), item);
  }
  return Array.from(years.values())
    .sort((a, b) => comparePeriodDesc(a.key, b.key))
    .map((year) => ({
      ...year,
      months: Array.from(year.months.values()).sort((a, b) =>
        comparePeriodDesc(a.key, b.key)
      ),
    }));
}

// 年ごと・月ごとの「注文数 / 収集済み / 未収集」(新しい年が先、日付不明は末尾)
function buildYearStats(orders, cache) {
  const withPending = (row) => ({ ...row, pending: row.count - row.collected });
  return groupByPeriod(
    orders,
    (order) => order.date,
    () => ({ count: 0, collected: 0 }),
    (row, order) => {
      row.count++;
      // 取得失敗は再取得の対象なので、ここでも未収集として数える
      // (数え方が pendingTargets とずれると「取得予定」の件数と食い違う)
      if (!needsCollect(cache[order.id])) row.collected++;
    }
  ).map((year) => ({ ...withPending(year), months: year.months.map(withPending) }));
}

// 月だけの平坦な一覧(範囲の選択肢や未収集の検出に使う)。年のまとまりを開くだけ
function buildMonthStats(orders, cache) {
  return buildYearStats(orders, cache).flatMap((year) => year.months);
}

// 年 → 月 の二段階で支払額を集計する(収集済みの注文のみ)
function aggregateByPeriod(results) {
  return groupByPeriod(
    results.filter((r) => typeof r.amount === "number"),
    (r) => r.date,
    () => ({ count: 0, total: 0, gift: 0 }),
    (row, r) => {
      row.count++;
      row.total += r.amount;
      row.gift += giftAmount(r);
    }
  );
}

async function readStored(key, fallback) {
  const stored = await ext.storage.local.get([key]);
  return stored[key] === undefined ? fallback : stored[key];
}

async function writeStored(key, value) {
  await ext.storage.local.set({ [key]: value });
}

function loadCache() {
  return readStored(CACHE_KEY, {});
}

function loadIndex() {
  return readStored(INDEX_KEY, null);
}

function removeStored(key) {
  return ext.storage.local.remove(key);
}

function saveIndex(index) {
  return writeStored(INDEX_KEY, index);
}

function saveCache(cache) {
  return writeStored(CACHE_KEY, cache);
}

function loadSummary() {
  return readStored(SUMMARY_KEY, null);
}

function saveSummary(summary) {
  return writeStored(SUMMARY_KEY, summary);
}

// 集計ページのタブが不意に閉じられたりクラッシュしたりすると、終了時の
// clearRunState() が間に合わず進捗が残る。残ったままだとポップアップが
// 永久に「実行中」を出し続けるため、しばらく更新のない進捗は動いていないとみなす。
// 進捗は取得1件ごとに書き直されるので、1件の取得にかかる時間より十分長くとる
const RUN_STATE_STALE_MS = 30_000;

async function loadRunState() {
  const runState = await readStored(RUN_STATE_KEY, null);
  if (!runState) return null;
  // 時刻を持たないのは、この仕組みより前のバージョンが残した進捗。
  // 動いていない可能性が高いので同じく無視する
  if (typeof runState.updatedAt !== "number") return null;
  return Date.now() - runState.updatedAt > RUN_STATE_STALE_MS ? null : runState;
}

function saveRunState(state) {
  return writeStored(RUN_STATE_KEY, { ...state, updatedAt: Date.now() });
}

function clearRunState() {
  return ext.storage.local.remove(RUN_STATE_KEY);
}

// 集計ページを開く。既に開いているタブがあればそれをフォーカスする
// (tabs.query での検索は "tabs" 権限が必要になるため、タブIDを保存して使い回す)
async function openDashboard() {
  const url = ext.runtime.getURL("dashboard.html");
  const tabId = await readStored(DASHBOARD_TAB_KEY, null);
  if (tabId != null) {
    try {
      const tab = await ext.tabs.get(tabId);
      await ext.tabs.update(tab.id, { active: true });
      if (tab.windowId != null && ext.windows) {
        await ext.windows.update(tab.windowId, { focused: true });
      }
      return tab.id;
    } catch (e) {
      // 既に閉じられている場合は新規に開く
    }
  }
  const created = await ext.tabs.create({ url });
  await writeStored(DASHBOARD_TAB_KEY, created.id);
  return created.id;
}
