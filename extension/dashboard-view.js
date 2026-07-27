"use strict";

// 集計ページの「画面に出す」側だけを集めたファイル。
// ここではイベントを受け取らない(addEventListener は dashboard.js 側にまとめてある)。
// 描画のもとになる state / running と、そこからの導出(targetOrders など)は
// dashboard.js が持つものをそのまま読む。

// ---- DOM参照 -----------------------------------------------------------

const fetchIndexBtn = document.getElementById("fetchIndexBtn");
const forceRefreshIndex = document.getElementById("forceRefreshIndex");
const indexStatus = document.getElementById("indexStatus");
const indexCoverage = document.getElementById("indexCoverage");
const monthEmpty = document.getElementById("monthEmpty");
const monthArea = document.getElementById("monthArea");
const rangeArea = document.getElementById("rangeArea");
const monthTableBody = document.getElementById("monthTableBody");
const rangeFrom = document.getElementById("rangeFrom");
const rangeTo = document.getElementById("rangeTo");
const selectPendingBtn = document.getElementById("selectPendingBtn");
const collectRangeBtn = document.getElementById("collectRangeBtn");
const plannedCountEl = document.getElementById("plannedCount");
const forceRefreshRange = document.getElementById("forceRefreshRange");
const unknownArea = document.getElementById("unknownArea");
const unknownCount = document.getElementById("unknownCount");
const clearIndexBtn = document.getElementById("clearIndexBtn");
const clearIndexStatus = document.getElementById("clearIndexStatus");
const clearAmountsBtn = document.getElementById("clearAmountsBtn");
const clearAmountsStatus = document.getElementById("clearAmountsStatus");
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
const totalGiftEl = document.getElementById("totalGift");
const footTotalGift = document.getElementById("footTotalGift");
const footYearGift = document.getElementById("footYearGift");
const shareBtn = document.getElementById("shareBtn");
const totalCountEl = document.getElementById("totalCount");
const pendingCountEl = document.getElementById("pendingCount");
const skippedCountEl = document.getElementById("skippedCount");
const periodTableBody = document.getElementById("periodTableBody");
const orderTableBody = document.getElementById("orderTableBody");
const noticeBox = document.getElementById("noticeBox");
const errorBox = document.getElementById("errorBox");

// 実行中は押せなくするボタン
const ACTION_BUTTONS = [
  fetchIndexBtn,
  collectRangeBtn,
  runAllBtn,
  selectPendingBtn,
  clearIndexBtn,
  clearAmountsBtn,
];

// 折りたたみ表で開いている年。再描画のたびに行を作り直すため、
// 開閉状態はDOMではなくこちらで持つ(表ごとに1つ)
const expandedMonthYears = new Set();
const expandedPeriodYears = new Set();

// 共有文面に使う集計値(描画のたびに更新する)
let shareStats = null;

// ---- 要素の組み立て ----------------------------------------------------

// 文字列を組み立てて innerHTML に流し込む代わりに要素を直接作る。
// 注文番号など外部由来の文字列を textContent で入れるので、エスケープ漏れが起きない
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function td(text, className) {
  return el("td", className, text);
}

// 折りたたみの三角印を添えた見出しセル
function toggleCell(label, expanded) {
  const cell = td("");
  cell.appendChild(el("span", "toggle", expanded ? "▾" : "▸"));
  cell.appendChild(document.createTextNode(` ${label}`));
  return cell;
}

// 金額のセル。ギフト分がある注文は、金額の左に小さく併記する
function amountCell(total, gift) {
  const cell = td("", "num");
  if (gift > 0) cell.appendChild(el("span", "gift", giftText(gift)));
  cell.appendChild(document.createTextNode(formatYen(total)));
  return cell;
}

// 「年の行 → その年の月の行」の順に並ぶ折りたたみ表を描画する。
// 列の中身は表ごとに違うので、行の組み立ては buildYearRow / buildMonthRow に委ねる。
// buildMonthRow が null を返した年は月の行を持たない(日付不明の年)
function renderCollapsibleTable(tbody, years, expandedKeys, buildYearRow, buildMonthRow) {
  tbody.innerHTML = "";
  for (const year of years) {
    const expanded = expandedKeys.has(year.key);
    const yearRow = buildYearRow(year, expanded);
    if (year.key !== null) yearRow.dataset.yearKey = year.key;
    tbody.appendChild(yearRow);

    for (const month of year.months) {
      const monthRow = buildMonthRow(month, year);
      if (!monthRow) continue;
      monthRow.dataset.yearKey = year.key;
      monthRow.hidden = !expanded;
      tbody.appendChild(monthRow);
    }
  }
}

// 月別の収集状況と年別・月別の集計は、どちらも「年の行で月の行を折りたためる表」。
// 開閉の操作はここで共通化し、どこをクリックしたら何が起きるかだけを表ごとに変える
function toggleYearRow(tbody, expandedKeys, yearRow) {
  const key = yearRow.dataset.yearKey;
  const expanded = expandedKeys.has(key);
  if (expanded) {
    expandedKeys.delete(key);
  } else {
    expandedKeys.add(key);
  }
  yearRow.querySelector(".toggle").textContent = expanded ? "▸" : "▾";
  tbody
    .querySelectorAll(`tr.month-row[data-year-key="${key}"]`)
    .forEach((row) => {
      row.hidden = expanded;
    });
}

// ---- 進捗・通知 --------------------------------------------------------

// 実行中は操作を止める。running そのものは dashboard.js が持つ
function renderRunningState(isRunning) {
  ACTION_BUTTONS.forEach((btn) => {
    btn.disabled = isRunning;
  });
  forceRefreshIndex.disabled = isRunning;
  forceRefreshRange.disabled = isRunning;
  forceRefreshAll.disabled = isRunning;
  rangeFrom.disabled = isRunning;
  rangeTo.disabled = isRunning;
  abortBtn.disabled = !isRunning;
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

// ---- 描画 --------------------------------------------------------------

function render() {
  renderIndexStatus();
  renderMonthArea();
  renderResult();
  updatePlannedCount();
  renderClearArea();
}

function renderClearArea() {
  const indexCount = state.index ? state.index.orders.length : 0;
  const amountCount = Object.keys(state.cache).length;
  clearIndexStatus.textContent =
    indexCount > 0 ? `保存中: ${indexCount}件` : "保存されていません";
  clearAmountsStatus.textContent =
    amountCount > 0 ? `保存中: ${amountCount}件` : "保存されていません";
  if (!running) {
    clearIndexBtn.disabled = indexCount === 0;
    clearAmountsBtn.disabled = amountCount === 0;
  }
}

function renderIndexStatus() {
  if (!state.index) {
    indexStatus.textContent = "まだ取得していません";
    indexCoverage.hidden = true;
    return;
  }
  const skipped = skippedCount();
  indexStatus.textContent =
    `最終取得: ${formatTimestamp(state.index.updatedAt)} / ` +
    `注文数: ${targetOrders().length}件` +
    (skipped > 0 ? ` (キャンセル ${skipped}件を除く)` : "");

  // 一覧は新しい順に辿るため、取得できた範囲は必ず「最新〜どこか」になる。
  // 途中で終わっているとそれより古い注文が丸ごと欠けるので、明示する
  const oldest = oldestCoveredOrder();
  const complete = indexIsComplete(state.index);
  indexCoverage.hidden = false;
  indexCoverage.classList.toggle("warn", !complete);
  if (complete) {
    indexCoverage.textContent = oldest
      ? `取得済みの範囲: 全期間 (最古の注文 ${oldest.date})`
      : "取得済みの範囲: 全期間";
  } else {
    indexCoverage.textContent = oldest
      ? `取得済みの範囲: 最新 〜 ${oldest.date} (途中で終了したため、これより古い注文は取得できていません。「キャッシュを無視して全件再取得」で取り直せます)`
      : "取得途中で終了したため、範囲が確定していません。「キャッシュを無視して全件再取得」で取り直してください";
  }
}

function renderMonthArea() {
  const stats = currentMonthStats();
  const hasIndex = Boolean(state.index) && stats.length > 0;
  monthEmpty.hidden = hasIndex;
  monthArea.hidden = !hasIndex;
  if (!hasIndex) return;

  renderCollapsibleTable(
    monthTableBody,
    buildYearStats(targetOrders(), state.cache),
    expandedMonthYears,
    (year, expanded) => {
      // 日付不明の年はまとめようがないので、折りたたまずに1行だけ出す
      if (year.key === null) return statRow(year, { className: "unknown-row" });
      const row = statRow(year, { className: "year-row", toggle: true, expanded });
      // 年をクリックしたときに設定する範囲(その年に存在する月の最古〜最新)
      row.dataset.rangeFrom = year.months[year.months.length - 1].key;
      row.dataset.rangeTo = year.months[0].key;
      return row;
    },
    (month, year) => {
      if (year.key === null) return null;
      const row = statRow(month, { className: "month-row", indent: true });
      row.dataset.monthKey = month.key;
      return row;
    }
  );

  const datedStats = stats.filter((s) => s.key !== null);
  rangeArea.hidden = datedStats.length === 0;
  if (datedStats.length > 0) {
    renderRangeOptions(datedStats);
  } else {
    rangeFrom.innerHTML = "";
    rangeTo.innerHTML = "";
  }

  const unknown = stats.find((s) => s.key === null);
  unknownArea.hidden = !unknown;
  if (unknown) {
    unknownCount.textContent =
      `注文日時を読み取れなかった注文が${unknown.count}件あります` +
      `(未収集 ${unknown.pending}件)。月の範囲では指定できないため、` +
      `「まとめて一括集計」で収集してください。`;
  }
}

// 月別テーブルの1行(年・月・日付不明で共通)
function statRow(stat, { className, toggle, expanded, indent }) {
  const tr = el("tr", className);
  if (stat.pending > 0) tr.classList.add("has-pending");
  tr.appendChild(
    toggle ? toggleCell(stat.label, expanded) : td(stat.label, indent ? "indent" : null)
  );
  tr.appendChild(td(stat.count, "num"));
  tr.appendChild(td(stat.collected, "num"));
  tr.appendChild(td(stat.pending > 0 ? stat.pending : "—", "num"));
  return tr;
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
  monthTableBody.querySelectorAll("tr.month-row").forEach((tr) => {
    const key = tr.dataset.monthKey;
    tr.classList.toggle("in-range", key >= lo && key <= hi);
  });
  // 年は、その年の月がすべて範囲に入っているときだけ強調する
  monthTableBody.querySelectorAll("tr.year-row").forEach((tr) => {
    const covered = tr.dataset.rangeFrom >= lo && tr.dataset.rangeTo <= hi;
    tr.classList.toggle("in-range", covered);
  });
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
  const gift = valid.reduce((sum, r) => sum + giftAmount(r), 0);

  totalAmountEl.textContent = formatYen(total);
  totalGiftEl.textContent = giftText(gift);
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
  const sumGift = (rows) => rows.reduce((total, r) => total + giftAmount(r), 0);

  footTotal.textContent = formatYen(sum(valid));
  footTotalGift.textContent = giftText(sumGift(valid));
  footTotalCount.textContent = `収集済み ${valid.length}件`;
  footYearLabel.textContent = `${thisYear}年`;
  footYearTotal.textContent = formatYen(sum(ofThisYear));
  footYearGift.textContent = giftText(sumGift(ofThisYear));
  footYearCount.textContent = `収集済み ${ofThisYear.length}件`;

  shareStats = {
    year: thisYear,
    total: sum(valid),
    count: valid.length,
    yearTotal: sum(ofThisYear),
    yearCount: ofThisYear.length,
    gift: sumGift(valid),
    yearGift: sumGift(ofThisYear),
  };
  shareBtn.disabled = valid.length === 0;
}

function renderPeriodTable(results) {
  const amountRow = (className, label, row) => {
    const tr = el("tr", className);
    tr.appendChild(label);
    tr.appendChild(td(`${row.count}件`, "num"));
    tr.appendChild(amountCell(row.total, row.gift));
    return tr;
  };
  renderCollapsibleTable(
    periodTableBody,
    aggregateByPeriod(results),
    expandedPeriodYears,
    (year, expanded) => amountRow("year-row", toggleCell(year.label, expanded), year),
    // 年は親の行に出ているので、月は「5月」とだけ書く
    (month) => amountRow("month-row", td(month.shortLabel), month)
  );
}

function renderOrderTable(results) {
  orderTableBody.innerHTML = "";
  const sorted = [...results].sort((a, b) => orderSortKey(b) - orderSortKey(a));
  for (const r of sorted) {
    const tr = el("tr");
    tr.appendChild(td(r.date));
    tr.appendChild(td(STATUS_LABELS[r.status] || r.status));
    if (typeof r.amount === "number") {
      tr.appendChild(amountCell(r.amount, giftAmount(r)));
    } else if (r.amount === null) {
      tr.appendChild(td("取得失敗", "num amount-failed"));
    } else {
      tr.appendChild(td("未収集", "num amount-pending"));
    }
    tr.appendChild(td(r.id));
    orderTableBody.appendChild(tr);
  }
}

// ---- 共有文面 ----------------------------------------------------------

const SHARE_HASHTAG = "#BOOTHお買いものレポート";

// 合計以下の項目から最も高いものを選ぶ。マスターは金額の昇順で管理する
function purchaseComparison(amount) {
  let selected = PURCHASE_EXAMPLE_MASTER[0];
  for (const example of PURCHASE_EXAMPLE_MASTER) {
    if (example.amount > amount) break;
    selected = example;
  }
  return selected.label;
}

function buildShareText(stats) {
  return [
    "BOOTHお買いもの振り返り🛍️",
    "",
    `合計：${formatYen(stats.total)}（${stats.count}件）`,
    `今年：${formatYen(stats.yearTotal)}（${stats.yearCount}件）`,
    "",
    `積み重ねてみると、${purchaseComparison(stats.total)}が買えるくらいの金額になりました。`,
    "",
    SHARE_HASHTAG,
  ].join("\n");
}
