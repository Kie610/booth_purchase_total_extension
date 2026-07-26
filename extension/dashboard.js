"use strict";

const ORDERS_INDEX_URL = "https://accounts.booth.pm/orders";
const ORDER_DETAIL_URL = "https://accounts.booth.pm/orders/";
const REQUEST_INTERVAL_MS = 250; // サーバーへの負荷を抑えるための待機時間
const CACHE_FLUSH_EVERY = 5; // 取得途中で中断されても失わないよう小まめに保存する
const RUN_STATE_INTERVAL_MS = 400; // ポップアップへ進捗を渡す書き込みの間引き
const EXCLUDED_STATUSES = new Set(["cancelled"]);

const fetchIndexBtn = document.getElementById("fetchIndexBtn");
const indexStatus = document.getElementById("indexStatus");
const monthEmpty = document.getElementById("monthEmpty");
const monthArea = document.getElementById("monthArea");
const monthTableBody = document.getElementById("monthTableBody");
const rangeFrom = document.getElementById("rangeFrom");
const rangeTo = document.getElementById("rangeTo");
const selectPendingBtn = document.getElementById("selectPendingBtn");
const collectRangeBtn = document.getElementById("collectRangeBtn");
const plannedCountEl = document.getElementById("plannedCount");
const forceRefreshRange = document.getElementById("forceRefreshRange");
const unknownArea = document.getElementById("unknownArea");
const unknownCount = document.getElementById("unknownCount");
const runAllBtn = document.getElementById("runAllBtn");
const forceRefreshAll = document.getElementById("forceRefreshAll");
const abortBtn = document.getElementById("abortBtn");
const progressBox = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const summarySection = document.getElementById("summarySection");
const breakdownSection = document.getElementById("breakdownSection");
const orderRowCountEl = document.getElementById("orderRowCount");
const footTotal = document.getElementById("footTotal");
const footTotalCount = document.getElementById("footTotalCount");
const footYearLabel = document.getElementById("footYearLabel");
const footYearTotal = document.getElementById("footYearTotal");
const footYearCount = document.getElementById("footYearCount");
const totalAmountEl = document.getElementById("totalAmount");
const totalCountEl = document.getElementById("totalCount");
const pendingCountEl = document.getElementById("pendingCount");
const skippedCountEl = document.getElementById("skippedCount");
const periodTableBody = document.getElementById("periodTableBody");
const orderTableBody = document.getElementById("orderTableBody");
const noticeBox = document.getElementById("noticeBox");
const errorBox = document.getElementById("errorBox");

const ACTION_BUTTONS = [
  fetchIndexBtn,
  collectRangeBtn,
  runAllBtn,
  selectPendingBtn,
];

let running = false;
let abortController = null;
let lastRunStateWrite = 0;
const state = { index: null, cache: {} };

fetchIndexBtn.addEventListener("click", () =>
  runTask(fetchIndexTask, "注文履歴を取得しました。")
);

collectRangeBtn.addEventListener("click", () =>
  runTask((signal) => collectRangeTask(signal))
);

runAllBtn.addEventListener("click", () => runTask(runAllTask));

forceRefreshRange.addEventListener("change", updatePlannedCount);

abortBtn.addEventListener("click", () => {
  if (abortController) {
    abortController.abort();
    abortBtn.disabled = true;
    setProgress("中断しています...");
  }
});

selectPendingBtn.addEventListener("click", () => {
  const pending = currentMonthStats().filter((s) => s.key && s.pending > 0);
  if (pending.length === 0) {
    showNotice("未収集の注文はありません。");
    return;
  }
  const keys = pending.map((s) => s.key);
  setRange(keys[keys.length - 1], keys[0]);
});

monthTableBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-month-key]");
  if (!row || running) return;
  const key = row.dataset.monthKey;
  if (key === "null") return; // 日付不明は範囲で表せないため専用ボタンで扱う
  setRange(key, key);
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

  state.index = await loadIndex();
  state.cache = await loadCache();
  render();
}

// ---- 実行の共通処理 ----------------------------------------------------

async function runTask(task, successNotice) {
  if (running) return;
  setRunning(true);
  clearError();
  clearNotice();
  abortController = new AbortController();
  let aborted = false;
  let failed = false;

  try {
    await task(abortController.signal);
  } catch (err) {
    if (err.name === "AbortError") {
      aborted = true;
    } else {
      failed = true;
      showError(err.message || String(err));
    }
  } finally {
    await saveCache(state.cache);
    await clearRunState();
    abortController = null;
    setRunning(false);
  }

  render();
  await saveSummary(buildSummary(aborted));

  if (aborted) {
    showNotice(
      "中断しました。ここまでに取得した金額は保存されているため、再実行すると続きから取得します。"
    );
  } else if (!failed && successNotice) {
    showNotice(successNotice);
  }
}

function abortError() {
  const err = new Error("処理を中断しました");
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
  ACTION_BUTTONS.forEach((btn) => {
    btn.disabled = isRunning;
  });
  forceRefreshRange.disabled = isRunning;
  forceRefreshAll.disabled = isRunning;
  rangeFrom.disabled = isRunning;
  rangeTo.disabled = isRunning;
  abortBtn.disabled = false;
  if (!isRunning) {
    progressBox.hidden = true;
    document.body.classList.remove("has-progress");
  }
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
  // フッターに進捗を出す分だけ高さが増えるので、本文の下余白も広げる
  document.body.classList.add("has-progress");
  progressText.textContent = text;
  if (typeof ratio === "number") {
    progressFill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }
}

// ポップアップ側で進捗を表示できるようにストレージへ書き出す(書き込み過多を避けて間引く)
async function publishRunState(runState, force) {
  const now = Date.now();
  if (!force && now - lastRunStateWrite < RUN_STATE_INTERVAL_MS) return;
  lastRunStateWrite = now;
  await saveRunState(runState);
}

// ---- 取得処理 ----------------------------------------------------------

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

// ① 一覧ページを全ページ巡回し、注文の索引を作る
async function fetchIndexTask(signal) {
  setProgress("購入履歴の1ページ目を取得中...", 0);
  await publishRunState({ phase: "注文履歴の取得", current: 0, total: 0 }, true);

  const firstDoc = await fetchDoc(ORDERS_INDEX_URL, signal);
  const { orders: firstOrders, maxPage } = parseListPage(firstDoc);
  const allRows = [...firstOrders];

  for (let page = 2; page <= maxPage; page++) {
    setProgress(
      `購入履歴一覧を取得中... (${page}/${maxPage}ページ)`,
      page / maxPage
    );
    await publishRunState({
      phase: "注文履歴の取得",
      current: page,
      total: maxPage,
    });
    await sleep(REQUEST_INTERVAL_MS, signal);
    const doc = await fetchDoc(`${ORDERS_INDEX_URL}?page=${page}`, signal);
    allRows.push(...parseListPage(doc).orders);
  }

  // 同一注文が商品数だけ複数行として現れるため、注文IDで重複除去する
  // （これが既存拡張の「同一ショップの複数商品購入で重複カウントされる」不具合の原因）
  const unique = new Map();
  for (const row of allRows) {
    if (!unique.has(row.id)) unique.set(row.id, row);
  }

  state.index = {
    updatedAt: new Date().toISOString(),
    orders: Array.from(unique.values()),
  };
  await saveIndex(state.index);
}

// 収集対象の絞り込み。forceが立っている場合は収集済みでも取り直す
function pendingTargets(orders, force) {
  return force ? orders : orders.filter((o) => !state.cache[o.id]);
}

// 指定された月の範囲(両端を含む)に入る注文。日付が読めない注文は範囲に入れない
function ordersInRange(from, to) {
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  return targetOrders().filter((o) => {
    const key = monthKeyOf(o.date);
    return key !== null && key >= lo && key <= hi;
  });
}

// ② 指定された注文の詳細ページから支払金額を集める
async function collectAmounts(orders, force, signal) {
  const targets = pendingTargets(orders, force);
  if (targets.length === 0) {
    showNotice("選択範囲に収集する注文はありません(すべて収集済みです)。");
    return 0;
  }

  let done = 0;
  for (const order of targets) {
    setProgress(
      `金額を収集中... (${done + 1}/${targets.length}件)`,
      done / targets.length
    );
    await publishRunState({
      phase: "金額の収集",
      current: done + 1,
      total: targets.length,
    });

    const doc = await fetchDoc(`${ORDER_DETAIL_URL}${order.id}`, signal);
    const detail = parseDetailPage(doc);
    state.cache[order.id] = {
      amount: detail.amount,
      status: order.status,
      date: order.date,
    };
    done++;

    if (done % CACHE_FLUSH_EVERY === 0) await saveCache(state.cache);
    if (done < targets.length) await sleep(REQUEST_INTERVAL_MS, signal);
  }
  return done;
}

async function collectRangeTask(signal) {
  const from = rangeFrom.value;
  const to = rangeTo.value;
  if (!from || !to) {
    showNotice("収集する範囲を選択してください。");
    return;
  }
  // 開始と終了は入れ替えて指定されても良いようにそろえる
  await collectAmounts(ordersInRange(from, to), forceRefreshRange.checked, signal);
}

async function runAllTask(signal) {
  if (forceRefreshAll.checked) state.cache = {};
  await fetchIndexTask(signal);
  await collectAmounts(targetOrders(), forceRefreshAll.checked, signal);
}

// ---- 解析 --------------------------------------------------------------

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

// ---- 表示 --------------------------------------------------------------

// キャンセル以外の注文(集計対象)
function targetOrders() {
  if (!state.index) return [];
  return state.index.orders.filter((o) => !EXCLUDED_STATUSES.has(o.status));
}

function skippedCount() {
  if (!state.index) return 0;
  return state.index.orders.length - targetOrders().length;
}

function currentMonthStats() {
  return buildMonthStats(targetOrders(), state.cache);
}

// 索引と収集済みの金額を突き合わせて表示用の一覧にする
// amount: 数値=収集済み / null=取得失敗 / undefined=未収集
function buildResults() {
  if (state.index) {
    return targetOrders().map((o) => ({
      id: o.id,
      date: o.date,
      status: o.status,
      amount: state.cache[o.id] ? state.cache[o.id].amount : undefined,
    }));
  }
  // 索引が無い場合(旧バージョンからの移行時)はキャッシュだけで表示する
  return Object.entries(state.cache).map(([id, entry]) => ({
    id,
    date: entry.date,
    status: entry.status,
    amount: entry.amount,
  }));
}

function render() {
  renderIndexStatus();
  renderMonthArea();
  renderResult();
  updatePlannedCount();
}

function renderIndexStatus() {
  if (!state.index) {
    indexStatus.textContent = "まだ取得していません";
    return;
  }
  const skipped = skippedCount();
  indexStatus.textContent =
    `最終取得: ${formatTimestamp(state.index.updatedAt)} / ` +
    `注文数: ${targetOrders().length}件` +
    (skipped > 0 ? ` (キャンセル ${skipped}件を除く)` : "");
}

function renderMonthArea() {
  const stats = currentMonthStats();
  const hasIndex = Boolean(state.index) && stats.length > 0;
  monthEmpty.hidden = hasIndex;
  monthArea.hidden = !hasIndex;
  if (!hasIndex) return;

  monthTableBody.innerHTML = "";
  for (const stat of stats) {
    const tr = document.createElement("tr");
    tr.dataset.monthKey = String(stat.key);
    if (stat.pending > 0) tr.classList.add("has-pending");
    if (stat.key === null) tr.classList.add("unknown-row");
    tr.innerHTML = `
      <td>${escapeHtml(stat.label)}</td>
      <td class="num">${stat.count}</td>
      <td class="num">${stat.collected}</td>
      <td class="num">${stat.pending > 0 ? stat.pending : "—"}</td>
    `;
    monthTableBody.appendChild(tr);
  }

  renderRangeOptions(stats.filter((s) => s.key !== null));

  const unknown = stats.find((s) => s.key === null);
  unknownArea.hidden = !unknown;
  if (unknown) {
    unknownCount.textContent =
      `注文日時を読み取れなかった注文が${unknown.count}件あります` +
      `(未収集 ${unknown.pending}件)。月の範囲では指定できないため、` +
      `「まとめて一括集計」で収集してください。`;
  }
}

function renderRangeOptions(monthStats) {
  const keys = monthStats.map((s) => s.key);
  const prevFrom = rangeFrom.value;
  const prevTo = rangeTo.value;

  for (const select of [rangeFrom, rangeTo]) {
    select.innerHTML = "";
    for (const stat of monthStats) {
      const option = document.createElement("option");
      option.value = stat.key;
      option.textContent =
        stat.label + (stat.pending > 0 ? `（未収集 ${stat.pending}）` : "");
      select.appendChild(option);
    }
  }

  // 既存の選択を保てるなら保ち、無理なら未収集のある最新の月に寄せる
  const fallback = (monthStats.find((s) => s.pending > 0) || monthStats[0]).key;
  rangeFrom.value = keys.includes(prevFrom) ? prevFrom : fallback;
  rangeTo.value = keys.includes(prevTo) ? prevTo : fallback;
}

function setRange(from, to) {
  rangeFrom.value = from;
  rangeTo.value = to;
  highlightSelectedRange();
  updatePlannedCount();
}

// 選択範囲で実際に取得しにいく件数(キャッシュ無視の指定を反映する)
function updatePlannedCount() {
  const from = rangeFrom.value;
  const to = rangeTo.value;
  if (!from || !to) {
    plannedCountEl.textContent = "";
    return;
  }
  const planned = pendingTargets(
    ordersInRange(from, to),
    forceRefreshRange.checked
  ).length;
  plannedCountEl.textContent =
    planned > 0 ? `取得予定: ${planned}件` : "取得予定: なし(収集済み)";
  if (!running) collectRangeBtn.disabled = planned === 0;
}

function highlightSelectedRange() {
  const from = rangeFrom.value;
  const to = rangeTo.value;
  if (!from || !to) return;
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  monthTableBody.querySelectorAll("tr[data-month-key]").forEach((tr) => {
    const key = tr.dataset.monthKey;
    tr.classList.toggle("in-range", key !== "null" && key >= lo && key <= hi);
  });
}

rangeFrom.addEventListener("change", onRangeChanged);
rangeTo.addEventListener("change", onRangeChanged);

function onRangeChanged() {
  highlightSelectedRange();
  updatePlannedCount();
}

function buildSummary(partial) {
  const results = buildResults();
  const valid = results.filter((r) => typeof r.amount === "number");
  return {
    total: valid.reduce((sum, r) => sum + r.amount, 0),
    count: valid.length,
    pendingCount: results.filter((r) => r.amount === undefined).length,
    failedCount: results.filter((r) => r.amount === null).length,
    skippedCancelled: skippedCount(),
    partial: Boolean(partial),
    updatedAt: new Date().toISOString(),
  };
}

function renderResult() {
  const results = buildResults();
  renderFooter(results);

  if (results.length === 0) {
    summarySection.hidden = true;
    breakdownSection.hidden = true;
    return;
  }

  const valid = results.filter((r) => typeof r.amount === "number");
  const pending = results.filter((r) => r.amount === undefined).length;
  const failed = results.filter((r) => r.amount === null).length;
  const total = valid.reduce((sum, r) => sum + r.amount, 0);

  totalAmountEl.textContent = formatYen(total);
  totalCountEl.textContent = `収集済み: ${valid.length}件`;
  pendingCountEl.textContent = pending > 0 ? `未収集: ${pending}件` : "";
  skippedCountEl.textContent =
    `除外(キャンセル): ${skippedCount()}件` +
    (failed > 0 ? ` / 金額取得失敗: ${failed}件` : "");

  renderPeriodTable(results);
  renderOrderTable(results);
  orderRowCountEl.textContent = `(${results.length}件)`;
  highlightSelectedRange();

  summarySection.hidden = false;
  breakdownSection.hidden = false;
}

// 画面下部に固定表示する合計。収集済みの注文のみを対象にする
function renderFooter(results) {
  const thisYear = new Date().getFullYear();
  const valid = results.filter((r) => typeof r.amount === "number");
  const ofThisYear = valid.filter((r) => {
    const d = parseOrderDate(r.date);
    return d !== null && d.year === thisYear;
  });
  const sum = (rows) => rows.reduce((total, r) => total + r.amount, 0);

  footTotal.textContent = formatYen(sum(valid));
  footTotalCount.textContent = `収集済み ${valid.length}件`;
  footYearLabel.textContent = `${thisYear}年`;
  footYearTotal.textContent = formatYen(sum(ofThisYear));
  footYearCount.textContent = `収集済み ${ofThisYear.length}件`;
}

function renderPeriodTable(results) {
  const expandedYears = new Set(
    Array.from(periodTableBody.querySelectorAll('.year-row[data-expanded="true"]'))
      .map((el) => el.dataset.yearKey)
  );
  periodTableBody.innerHTML = "";

  for (const year of aggregateByPeriod(results)) {
    const yearKey = String(year.key);
    const expanded = expandedYears.has(yearKey);
    const yearRow = document.createElement("tr");
    yearRow.className = "year-row";
    yearRow.dataset.yearKey = yearKey;
    yearRow.dataset.expanded = expanded ? "true" : "false";
    yearRow.innerHTML = `
      <td><span class="toggle">${expanded ? "▾" : "▸"}</span> ${escapeHtml(year.label)}</td>
      <td class="num">${year.count}件</td>
      <td class="num">${formatYen(year.total)}</td>
    `;
    periodTableBody.appendChild(yearRow);

    for (const month of year.months) {
      const monthRow = document.createElement("tr");
      monthRow.className = "month-row";
      monthRow.dataset.yearKey = yearKey;
      monthRow.hidden = !expanded;
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
    let amountCell;
    if (typeof r.amount === "number") {
      amountCell = `<td class="num">${formatYen(r.amount)}</td>`;
    } else if (r.amount === null) {
      amountCell = `<td class="num amount-failed">取得失敗</td>`;
    } else {
      amountCell = `<td class="num amount-pending">未収集</td>`;
    }
    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(STATUS_LABELS[r.status] || r.status)}</td>
      ${amountCell}
      <td>${escapeHtml(r.id)}</td>
    `;
    orderTableBody.appendChild(tr);
  }
}
