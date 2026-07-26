"use strict";

const ORDERS_INDEX_URL = "https://accounts.booth.pm/orders";
const REQUEST_INTERVAL_MS = 250; // サーバーへの負荷を抑えるための待機時間
const CACHE_FLUSH_EVERY = 5; // 取得途中でタブを閉じても失わないよう小まめに保存する
const RUN_STATE_INTERVAL_MS = 400; // ポップアップへ進捗を渡す書き込みの間引き

const runBtn = document.getElementById("runBtn");
const abortBtn = document.getElementById("abortBtn");
const forceRefreshEl = document.getElementById("forceRefresh");
const progressBox = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const resultBox = document.getElementById("result");
const totalAmountEl = document.getElementById("totalAmount");
const totalCountEl = document.getElementById("totalCount");
const skippedCountEl = document.getElementById("skippedCount");
const periodTableBody = document.getElementById("periodTableBody");
const orderTableBody = document.getElementById("orderTableBody");
const noticeBox = document.getElementById("noticeBox");
const errorBox = document.getElementById("errorBox");

let running = false;
let abortController = null;
let lastRunStateWrite = 0;

runBtn.addEventListener("click", () => {
  run().catch((err) => {
    showError(err.message || String(err));
    setRunning(false);
  });
});

abortBtn.addEventListener("click", () => {
  if (abortController) {
    abortController.abort();
    abortBtn.disabled = true;
    setProgress("中断しています...");
  }
});

periodTableBody.addEventListener("click", (event) => {
  const row = event.target.closest(".year-row");
  if (!row) return;
  const key = row.dataset.yearKey;
  const expanded = row.dataset.expanded === "true";
  row.dataset.expanded = expanded ? "false" : "true";
  row.querySelector(".toggle").textContent = expanded ? "▸" : "▾";
  periodTableBody
    .querySelectorAll(`.month-row[data-year-key="${key}"]`)
    .forEach((el) => {
      el.hidden = expanded;
    });
});

init();

async function init() {
  // ポップアップから「集計ページを開く」で復帰できるよう、自分のタブIDを覚えておく
  try {
    const tab = await ext.tabs.getCurrent();
    if (tab && tab.id != null) {
      await writeStored(DASHBOARD_TAB_KEY, tab.id);
    }
  } catch (e) {
    // タブIDが取れなくても集計自体には影響しない
  }
  window.addEventListener("pagehide", () => {
    ext.storage.local.remove(DASHBOARD_TAB_KEY);
    if (running) clearRunState();
  });

  // 前回の集計結果があればキャッシュから復元して表示する
  const summary = await loadSummary();
  if (summary) {
    const cache = await loadCache();
    const results = Object.entries(cache).map(([id, entry]) => ({
      id,
      date: entry.date,
      status: entry.status,
      amount: entry.amount,
    }));
    if (results.length > 0) {
      renderResult(results, summary.skippedCancelled || 0);
      showNotice(
        `前回の集計結果(${formatTimestamp(summary.updatedAt)}時点)を表示しています。最新の状態にするには「集計を実行」を押してください。`
      );
    }
  }
}

function abortError() {
  const err = new Error("集計を中断しました");
  err.name = "AbortError";
  return err;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

function setRunning(isRunning) {
  running = isRunning;
  runBtn.disabled = isRunning;
  runBtn.textContent = isRunning ? "集計中..." : "集計を実行";
  forceRefreshEl.disabled = isRunning;
  abortBtn.hidden = !isRunning;
  abortBtn.disabled = false;
  if (!isRunning) progressBox.hidden = true;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showNotice(message) {
  noticeBox.textContent = message;
  noticeBox.hidden = false;
}

function clearNotice() {
  noticeBox.hidden = true;
  noticeBox.textContent = "";
}

function setProgress(text, ratio) {
  progressBox.hidden = false;
  progressText.textContent = text;
  if (typeof ratio === "number") {
    progressFill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }
}

// ポップアップ側で進捗を表示できるようにストレージへ書き出す(書き込み過多を避けて間引く)
async function publishRunState(state, force) {
  const now = Date.now();
  if (!force && now - lastRunStateWrite < RUN_STATE_INTERVAL_MS) return;
  lastRunStateWrite = now;
  await saveRunState(state);
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

// 注意: 集計中、取得1件につき以下のCSP違反がコンソールに記録される。
//   Loading the script 'https://www.google.com/recaptcha/enterprise.js?...'
//   violates ... "script-src 'self'"
// これはBOOTHのレスポンスに
//   Link: <https://www.google.com/recaptcha/enterprise.js?...>; rel=preload; as=script
// ヘッダが含まれており、ブラウザがHTMLを見るまでもなくヘッダの時点で
// 先読みを試みるため。拡張ページのCSPが要求の発行前にブロックしており、
// 通信は発生せず集計結果にも影響しない。
// fetch側から先読みを抑止する手段は無く、HTML本文のタグを除去しても
// ヘッダ起点なので消えない(検証済み)。CSPに google.com を追加すれば
// 消せるが、それは読み込みを許可する意味になりMV3のリモートコード禁止に
// 抵触するため行わない。
async function fetchDoc(url, signal) {
  const res = await fetch(url, { credentials: "include", signal });
  if (res.url.includes("/users/sign_in")) {
    throw new Error(
      "ログインが必要です。accounts.booth.pm にログインしてから再度実行してください。"
    );
  }
  if (!res.ok) {
    throw new Error(`ページの取得に失敗しました (HTTP ${res.status}): ${url}`);
  }
  const html = await res.text();
  // DOMParserが生成する文書は不活性で、スクリプトは実行されず
  // 画像などのサブリソースも取得されない(検証済み)
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

async function run() {
  if (running) return;
  setRunning(true);
  clearError();
  clearNotice();
  resultBox.hidden = true;
  abortController = new AbortController();
  const signal = abortController.signal;
  const forceRefresh = forceRefreshEl.checked;

  const cache = forceRefresh ? {} : await loadCache();
  const results = [];
  let skippedCancelled = 0;
  let aborted = false;
  let failed = false;

  try {
    setProgress("購入履歴の1ページ目を取得中...", 0);
    await publishRunState({ phase: "一覧取得", current: 0, total: 0 }, true);

    const firstDoc = await fetchDoc(ORDERS_INDEX_URL, signal);
    const { orders: firstOrders, maxPage } = parseListPage(firstDoc);

    const allRows = [...firstOrders];
    for (let page = 2; page <= maxPage; page++) {
      setProgress(
        `購入履歴一覧を取得中... (${page}/${maxPage}ページ)`,
        (page - 1) / (maxPage + 1)
      );
      await publishRunState({ phase: "一覧取得", current: page, total: maxPage });
      const doc = await fetchDoc(`${ORDERS_INDEX_URL}?page=${page}`, signal);
      const { orders } = parseListPage(doc);
      allRows.push(...orders);
      await sleep(REQUEST_INTERVAL_MS, signal);
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
    for (const order of uniqueOrders.values()) {
      if (excludedStatuses.has(order.status)) {
        skippedCancelled++;
      } else {
        targetOrders.push(order);
      }
    }

    const toFetch = targetOrders.filter((o) => !cache[o.id]);
    let fetchedCount = 0;

    for (const order of targetOrders) {
      let amount = cache[order.id] ? cache[order.id].amount : undefined;

      if (amount === undefined) {
        setProgress(
          `注文詳細を取得中... (${fetchedCount + 1}/${toFetch.length}件, 新規分のみ)`,
          0.5 + 0.5 * ((fetchedCount + 1) / Math.max(1, toFetch.length))
        );
        await publishRunState({
          phase: "注文詳細取得",
          current: fetchedCount + 1,
          total: toFetch.length,
        });
        const detailDoc = await fetchDoc(
          `https://accounts.booth.pm/orders/${order.id}`,
          signal
        );
        const detail = parseDetailPage(detailDoc);
        amount = detail.amount;
        cache[order.id] = {
          amount: amount,
          status: order.status,
          date: order.date,
        };
        fetchedCount++;
        if (fetchedCount % CACHE_FLUSH_EVERY === 0) {
          await saveCache(cache);
        }
        await sleep(REQUEST_INTERVAL_MS, signal);
      }

      results.push({
        id: order.id,
        date: order.date,
        status: order.status,
        amount: amount,
      });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      aborted = true;
    } else {
      failed = true;
      showError(err.message || String(err));
    }
  } finally {
    await saveCache(cache);
    await clearRunState();
    abortController = null;
    setRunning(false);
  }

  if (failed) return;

  renderResult(results, skippedCancelled);
  const summary = buildSummary(results, skippedCancelled, aborted);
  await saveSummary(summary);

  if (aborted) {
    showNotice(
      `集計を中断しました。ここまでに取得した${results.length}件の結果を表示しています。取得済みの金額は保存されているため、再実行すると続きから取得します。`
    );
  }
}

function buildSummary(results, skippedCancelled, partial) {
  const valid = results.filter((r) => typeof r.amount === "number");
  return {
    total: valid.reduce((sum, r) => sum + r.amount, 0),
    count: valid.length,
    skippedCancelled,
    failedCount: results.length - valid.length,
    partial: Boolean(partial),
    updatedAt: new Date().toISOString(),
  };
}

function renderResult(results, skippedCancelled) {
  const validResults = results.filter((r) => typeof r.amount === "number");
  const total = validResults.reduce((sum, r) => sum + r.amount, 0);
  const failedCount = results.length - validResults.length;

  totalAmountEl.textContent = formatYen(total);
  totalCountEl.textContent = `対象注文数: ${validResults.length}件`;
  skippedCountEl.textContent =
    `除外(キャンセル): ${skippedCancelled}件` +
    (failedCount > 0 ? ` / 金額取得失敗: ${failedCount}件` : "");

  renderPeriodTable(results);
  renderOrderTable(results);

  progressBox.hidden = true;
  resultBox.hidden = false;
}

function renderPeriodTable(results) {
  periodTableBody.innerHTML = "";
  for (const year of aggregateByPeriod(results)) {
    const yearKey = String(year.key);
    const yearRow = document.createElement("tr");
    yearRow.className = "year-row";
    yearRow.dataset.yearKey = yearKey;
    yearRow.dataset.expanded = "false";
    yearRow.innerHTML = `
      <td><span class="toggle">▸</span> ${escapeHtml(year.label)}</td>
      <td class="num">${year.count}件</td>
      <td class="num">${formatYen(year.total)}</td>
    `;
    periodTableBody.appendChild(yearRow);

    for (const month of year.months) {
      const monthRow = document.createElement("tr");
      monthRow.className = "month-row";
      monthRow.dataset.yearKey = yearKey;
      monthRow.hidden = true;
      monthRow.innerHTML = `
        <td>${escapeHtml(month.label)}</td>
        <td class="num">${month.count}件</td>
        <td class="num">${formatYen(month.total)}</td>
      `;
      periodTableBody.appendChild(monthRow);
    }
  }
}

function renderOrderTable(results) {
  orderTableBody.innerHTML = "";
  const sorted = [...results].sort((a, b) => orderSortKey(b) - orderSortKey(a));
  for (const r of sorted) {
    const tr = document.createElement("tr");
    const amountCell =
      typeof r.amount === "number"
        ? `<td class="num">${formatYen(r.amount)}</td>`
        : `<td class="num amount-failed">取得失敗</td>`;
    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(STATUS_LABELS[r.status] || r.status)}</td>
      ${amountCell}
      <td>${escapeHtml(r.id)}</td>
    `;
    orderTableBody.appendChild(tr);
  }
}
