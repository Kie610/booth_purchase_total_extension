"use strict";

// Chrome / Firefox 両対応のための簡易ラッパー
const ext = typeof browser !== "undefined" ? browser : chrome;

const ORDERS_INDEX_URL = "https://accounts.booth.pm/orders";
const CACHE_KEY = "boothOrderCache"; // { [orderId]: { amount, status, date } }
const REQUEST_INTERVAL_MS = 250; // サーバーへの負荷を抑えるための待機時間

const runBtn = document.getElementById("runBtn");
const forceRefreshEl = document.getElementById("forceRefresh");
const progressBox = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const resultBox = document.getElementById("result");
const totalAmountEl = document.getElementById("totalAmount");
const totalCountEl = document.getElementById("totalCount");
const skippedCountEl = document.getElementById("skippedCount");
const orderTableBody = document.getElementById("orderTableBody");
const errorBox = document.getElementById("errorBox");

runBtn.addEventListener("click", () => {
  run().catch((err) => {
    showError(err.message || String(err));
    setRunning(false);
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRunning(isRunning) {
  runBtn.disabled = isRunning;
  runBtn.textContent = isRunning ? "集計中..." : "集計を実行";
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function setProgress(text, ratio) {
  progressBox.hidden = false;
  progressText.textContent = text;
  if (typeof ratio === "number") {
    progressFill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }
}

function parseYen(text) {
  if (!text) return null;
  const cleaned = text.replace(/[¥\s,]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

function extractOrderId(href) {
  const m = href.match(/\/orders\/([^/?#]+)/);
  return m ? m[1] : null;
}

function extractStatusFromBadge(badgeEl) {
  if (!badgeEl) return "unknown";
  const known = new Set(["badge", "mx-0", "align-top", "order-state"]);
  const token = Array.from(badgeEl.classList).find((c) => !known.has(c));
  return token || "unknown";
}

async function fetchDoc(url) {
  const res = await fetch(url, { credentials: "include" });
  if (res.url.includes("/users/sign_in")) {
    throw new Error(
      "ログインが必要です。accounts.booth.pm にログインしてから再度実行してください。"
    );
  }
  if (!res.ok) {
    throw new Error(`ページの取得に失敗しました (HTTP ${res.status}): ${url}`);
  }
  const html = await res.text();
  return new DOMParser().parseFromString(html, "text/html");
}

// 購入履歴一覧ページ1ページ分を解析し、注文の行情報と総ページ数を返す
function parseListPage(doc) {
  const rows = Array.from(
    doc.querySelectorAll('a.nav-reverse[href*="/orders/"]')
  );
  const orders = rows
    .map((a) => {
      const id = extractOrderId(a.getAttribute("href") || "");
      if (!id) return null;
      const badge = a.querySelector(".order-state");
      const status = extractStatusFromBadge(badge);
      const dateEl = a.querySelector(".u-tpg-caption2");
      const date = dateEl
        ? dateEl.textContent.replace(/^注文日時[:：]\s*/, "").trim()
        : "";
      return { id, status, date };
    })
    .filter(Boolean);

  let maxPage = 1;
  doc.querySelectorAll('.pager a[href*="page="]').forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });

  return { orders, maxPage };
}

// 注文詳細ページを解析し、実際の支払金額を取得する
function parseDetailPage(doc) {
  let amount = null;
  const candidates = Array.from(doc.querySelectorAll("div")).filter(
    (d) => d.textContent.trim() === "お支払金額"
  );
  for (const label of candidates) {
    const value = label.nextElementSibling;
    if (value) {
      const parsed = parseYen(value.textContent);
      if (parsed !== null) {
        amount = parsed;
        break;
      }
    }
  }
  const badge = doc.querySelector(".order-state");
  const status = extractStatusFromBadge(badge);
  return { amount, status };
}

async function loadCache() {
  const stored = await ext.storage.local.get([CACHE_KEY]);
  return stored[CACHE_KEY] || {};
}

async function saveCache(cache) {
  await ext.storage.local.set({ [CACHE_KEY]: cache });
}

async function run() {
  clearError();
  resultBox.hidden = true;
  setRunning(true);
  const forceRefresh = forceRefreshEl.checked;

  setProgress("購入履歴の1ページ目を取得中...", 0);
  const firstDoc = await fetchDoc(ORDERS_INDEX_URL);
  const { orders: firstOrders, maxPage } = parseListPage(firstDoc);

  const allRows = [...firstOrders];
  for (let page = 2; page <= maxPage; page++) {
    setProgress(
      `購入履歴一覧を取得中... (${page}/${maxPage}ページ)`,
      (page - 1) / (maxPage + 1)
    );
    const doc = await fetchDoc(`${ORDERS_INDEX_URL}?page=${page}`);
    const { orders } = parseListPage(doc);
    allRows.push(...orders);
    await sleep(REQUEST_INTERVAL_MS);
  }

  // 同一注文が商品数だけ複数行として現れるため、注文IDで重複除去する
  // （これが既存拡張の「同一ショップの複数商品購入で重複カウントされる」不具合の原因）
  const uniqueOrders = new Map();
  for (const row of allRows) {
    if (!uniqueOrders.has(row.id)) {
      uniqueOrders.set(row.id, row);
    }
  }

  const excludedStatuses = new Set(["cancelled"]);
  const targetOrders = [];
  let skippedCancelled = 0;
  for (const order of uniqueOrders.values()) {
    if (excludedStatuses.has(order.status)) {
      skippedCancelled++;
    } else {
      targetOrders.push(order);
    }
  }

  const cache = forceRefresh ? {} : await loadCache();
  const results = [];
  let fetchedCount = 0;
  const toFetch = targetOrders.filter((o) => !cache[o.id]);

  for (let i = 0; i < targetOrders.length; i++) {
    const order = targetOrders[i];
    let amount = cache[order.id] ? cache[order.id].amount : undefined;

    if (amount === undefined) {
      setProgress(
        `注文詳細を取得中... (${fetchedCount + 1}/${toFetch.length}件, 新規分のみ)`,
        0.5 + 0.5 * ((fetchedCount + 1) / Math.max(1, toFetch.length))
      );
      const detailDoc = await fetchDoc(
        `https://accounts.booth.pm/orders/${order.id}`
      );
      const detail = parseDetailPage(detailDoc);
      amount = detail.amount;
      cache[order.id] = {
        amount: amount,
        status: order.status,
        date: order.date,
      };
      fetchedCount++;
      await sleep(REQUEST_INTERVAL_MS);
    }

    results.push({
      id: order.id,
      date: order.date,
      status: order.status,
      amount: amount,
    });
  }

  await saveCache(cache);

  renderResult(results, skippedCancelled);
  setRunning(false);
}

const STATUS_LABELS = {
  completed: "発送完了",
  paid: "支払済み",
  unpaid: "未払い",
  cancelled: "キャンセル",
  unknown: "不明",
};

function renderResult(results, skippedCancelled) {
  const validResults = results.filter((r) => typeof r.amount === "number");
  const total = validResults.reduce((sum, r) => sum + r.amount, 0);
  const failedCount = results.length - validResults.length;

  totalAmountEl.textContent = `合計: ¥${total.toLocaleString("ja-JP")}`;
  totalCountEl.textContent = `対象注文数: ${validResults.length}件`;
  skippedCountEl.textContent =
    `除外(キャンセル): ${skippedCancelled}件` +
    (failedCount > 0 ? ` / 金額取得失敗: ${failedCount}件` : "");

  orderTableBody.innerHTML = "";
  const sorted = [...results].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const r of sorted) {
    const tr = document.createElement("tr");
    const amountText =
      typeof r.amount === "number" ? `¥${r.amount.toLocaleString("ja-JP")}` : "取得失敗";
    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(STATUS_LABELS[r.status] || r.status)}</td>
      <td class="amount">${amountText}</td>
      <td>${escapeHtml(r.id)}</td>
    `;
    orderTableBody.appendChild(tr);
  }

  progressBox.hidden = true;
  resultBox.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
