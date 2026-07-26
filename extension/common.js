"use strict";

// Chrome / Firefox 両対応のための簡易ラッパー
const ext = typeof browser !== "undefined" ? browser : chrome;

const CACHE_KEY = "boothOrderCache"; // { [orderId]: { amount, status, date } }
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
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

// 年 → 月 の二段階で支払額を集計する
function aggregateByPeriod(results) {
  const years = new Map();
  for (const r of results) {
    if (typeof r.amount !== "number") continue;
    const d = parseOrderDate(r.date);
    const yearKey = d ? d.year : null;
    if (!years.has(yearKey)) {
      years.set(yearKey, { year: yearKey, count: 0, total: 0, months: new Map() });
    }
    const year = years.get(yearKey);
    year.count++;
    year.total += r.amount;

    const monthKey = d ? d.month : null;
    if (!year.months.has(monthKey)) {
      year.months.set(monthKey, { month: monthKey, count: 0, total: 0 });
    }
    const month = year.months.get(monthKey);
    month.count++;
    month.total += r.amount;
  }

  const sortDesc = (a, b) => (b.key ?? -1) - (a.key ?? -1);
  return Array.from(years.values())
    .map((y) => ({
      year: y.year,
      label: y.year === null ? "日付不明" : `${y.year}年`,
      key: y.year,
      count: y.count,
      total: y.total,
      months: Array.from(y.months.values())
        .map((m) => ({
          month: m.month,
          label: m.month === null ? "月不明" : `${m.month}月`,
          key: m.month,
          count: m.count,
          total: m.total,
        }))
        .sort(sortDesc),
    }))
    .sort(sortDesc);
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

function saveCache(cache) {
  return writeStored(CACHE_KEY, cache);
}

function loadSummary() {
  return readStored(SUMMARY_KEY, null);
}

function saveSummary(summary) {
  return writeStored(SUMMARY_KEY, summary);
}

function loadRunState() {
  return readStored(RUN_STATE_KEY, null);
}

function saveRunState(state) {
  return writeStored(RUN_STATE_KEY, state);
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
