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
const outdatedArea = document.getElementById("outdatedArea");
const outdatedCount = document.getElementById("outdatedCount");
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
const trendsEmpty = document.getElementById("trendsEmpty");
const trendsArea = document.getElementById("trendsArea");
const trendSummary = document.getElementById("trendSummary");
const trendCurrentYearLabel = document.getElementById("trendCurrentYearLabel");
const trendPreviousYearLabel = document.getElementById("trendPreviousYearLabel");
const monthlyTrendChart = document.getElementById("monthlyTrendChart");
const cumulativeTrendChart = document.getElementById("cumulativeTrendChart");
const trendPeriodTableBody = document.getElementById("trendPeriodTableBody");
const orderTableBody = document.getElementById("orderTableBody");
const noticeBox = document.getElementById("noticeBox");
const errorBox = document.getElementById("errorBox");
const menuBtn = document.getElementById("menuBtn");
const navDrawer = document.getElementById("navDrawer");
const navOverlay = document.getElementById("navOverlay");
const viewTitle = document.getElementById("viewTitle");
const exportEmpty = document.getElementById("exportEmpty");
const exportArea = document.getElementById("exportArea");
const exportStats = document.getElementById("exportStats");
const exportGap = document.getElementById("exportGap");
const exportOrdersBtn = document.getElementById("exportOrdersBtn");
const exportItemsBtn = document.getElementById("exportItemsBtn");
const exportPreviewBody = document.getElementById("exportPreviewBody");
const rankingEmpty = document.getElementById("rankingEmpty");
const rankingArea = document.getElementById("rankingArea");
const rankingStats = document.getElementById("rankingStats");
const rankingUnknown = document.getElementById("rankingUnknown");
const rankingTableBody = document.getElementById("rankingTableBody");
const rankingSortToggle = document.getElementById("rankingSortToggle");
const rankingHideNumbers = document.getElementById("rankingHideNumbers");
const pendingBanner = document.getElementById("pendingBanner");
const pendingBannerText = document.getElementById("pendingBannerText");
const backupStats = document.getElementById("backupStats");
const backupCoverage = document.getElementById("backupCoverage");
const backupSaveBtn = document.getElementById("backupSaveBtn");
const restoreFile = document.getElementById("restoreFile");
const restoreStatus = document.getElementById("restoreStatus");

// 実行中は押せなくするボタン
const ACTION_BUTTONS = [
  fetchIndexBtn,
  collectRangeBtn,
  runAllBtn,
  selectPendingBtn,
  clearIndexBtn,
  clearAmountsBtn,
  backupSaveBtn,
];

// ---- 画面の切り替え ----------------------------------------------------
//
// 画面ごとにHTMLを分けず、同じページの中で区画を出し分ける。別ページへ移ると
// JSのコンテキストごと破棄され、数分かかる収集が丸ごと止まってしまうため
// (ポップアップではなく専用タブで処理しているのと同じ理由)。
// 現在の画面はURLのハッシュに持たせるので、再読み込みしても同じ画面に戻る。

const VIEW_NAMES = ["report", "trends", "ranking", "export", "backup"];
const DEFAULT_VIEW = "report";
// 見出しの右に添える画面名。既定の画面では何も足さない
const VIEW_TITLES = {
  report: "",
  trends: "支出推移・前年比較",
  ranking: "推し作者ランキング",
  export: "データ出力",
  backup: "データの引っ越し",
};

function viewFromHash(hash) {
  const name = String(hash || "").replace(/^#\/?/, "");
  return VIEW_NAMES.includes(name) ? name : DEFAULT_VIEW;
}

function renderCurrentView() {
  const current = viewFromHash(location.hash);
  for (const name of VIEW_NAMES) {
    document.getElementById(`view-${name}`).hidden = name !== current;
  }
  navDrawer.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("current", link.dataset.view === current);
  });
  viewTitle.textContent = VIEW_TITLES[current];
  renderPendingBanner(current);
  // 画面を移ると共有ボタンの中身が変わる。ハッシュの変化だけでも呼ばれるので、
  // 全体の描画を待たずにここで合わせる
  updateShareButton();
  return current;
}

// レポート以外の画面に出ている数字は、未収集や取得しきれていない注文があると
// 実際より少なくなる。数字だけを見せて黙っていると、それを正しい合計だと
// 思わせてしまうので、足りないことと収集する場所を伝える。
// 画面を増やしたときも自動で付くよう、区画の外に1つだけ置いてある
function renderPendingBanner(current) {
  if (current === DEFAULT_VIEW) {
    pendingBanner.hidden = true;
    return;
  }
  const pending = buildResults().filter((r) => needsCollect(state.cache[r.id])).length;
  const incomplete = Boolean(state.index) && !indexIsComplete(state.index);
  pendingBanner.hidden = pending === 0 && !incomplete;
  if (pendingBanner.hidden) return;

  const reasons = [];
  if (pending > 0) reasons.push(`未収集の注文が${pending}件あります`);
  // 索引が途中までだと、そもそも一覧に出ていない注文が残っている
  if (incomplete) reasons.push("注文履歴の取得が途中で終わっています");
  pendingBannerText.textContent =
    `${reasons.join("。")}。この画面の内容は実際より少なくなります。`;
}

function setDrawerOpen(open) {
  navDrawer.hidden = !open;
  navOverlay.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = navDrawer.querySelector(".nav-link");
    if (first) first.focus();
  } else {
    menuBtn.focus();
  }
}

function drawerIsOpen() {
  return !navDrawer.hidden;
}

// 折りたたみ表で開いている年。再描画のたびに行を作り直すため、
// 開閉状態はDOMではなくこちらで持つ(表ごとに1つ)
const expandedMonthYears = new Set();
const expandedPeriodYears = new Set();
const expandedTrendPeriodYears = new Set();

// 共有文面に使う集計値(描画のたびに更新する)
let shareStats = null;
let rankingShareStats = null;

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
  // 復元は state を丸ごと差し替えるので、収集中に走らせると取得結果と衝突する
  restoreFile.disabled = isRunning;
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

// 一括集計は①と②が続けて通知を出すため、上書きせず書き足す。
// (runTask が実行の最初に clearNotice() するので、実行をまたいで溜まることはない)
function addNotice(message) {
  const current = noticeBox.hidden ? "" : noticeBox.textContent;
  showNotice(current ? `${current}\n${message}` : message);
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
  renderCurrentView();
  renderIndexStatus();
  renderMonthArea();
  renderResult();
  renderSpendingTrends();
  updatePlannedCount();
  renderClearArea();
  renderRankingArea();
  renderExportArea();
  renderBackupArea();
  // 共有ボタンの状態は上の描画結果に依るので、最後にまとめて決める
  updateShareButton();
}

// ---- 推し作者ランキング ------------------------------------------------

// 上位何位まで出すか。王冠を付ける順位と、太字にする順位
const RANKING_LIMIT = 10;
const RANKING_CROWNS = 3;
const RANKING_BOLD = 5;

// 金額編・購入数編のどちらで並べているか。再描画で作り直す表には残せないので
// ここで持つ(開いている年の集合と同じ扱い)
let rankingSort = DEFAULT_SHOP_SORT;

const RANKING_SORT_LABELS = { amount: "金額編", count: "購入数編" };

function setRankingSort(sort) {
  if (!SHOP_SORTS[sort] || sort === rankingSort) return;
  rankingSort = sort;
  renderRankingArea();
  updateShareButton();
}

// 数量の左に小さく添えるギフト表記。金額のセルと置き方をそろえる
function countCell(count, giftCount) {
  const cell = td("", "num");
  if (giftCount > 0) cell.appendChild(el("span", "gift", giftCountText(giftCount)));
  cell.appendChild(document.createTextNode(`${count}点`));
  return cell;
}

// ショップ名。BOOTHのショップURLが取れていればリンクにする
// (URLは取得したHTML由来なので、booth.pm のものだけを通す)
const SHOP_URL_PATTERN = /^https:\/\/[\w-]+\.booth\.pm\/?$/;

function shopNameCell(row) {
  const cell = td("");
  if (SHOP_URL_PATTERN.test(row.url)) {
    const link = el("a", null, row.name);
    link.href = row.url;
    link.target = "_blank";
    link.rel = "noopener";
    cell.appendChild(link);
  } else {
    cell.textContent = row.name;
  }
  return cell;
}

function rankCell(rank) {
  const cell = td("", "rank");
  const badge = el("span", "rank-badge", String(rank));
  // 1〜3位は王冠を背景に敷く(金・銀・銅)
  if (rank <= RANKING_CROWNS) badge.classList.add(`rank-crown-${rank}`);
  cell.appendChild(badge);
  return cell;
}

// 押されている基準のボタンと、その基準で並べている列に印を付ける
function renderRankingSortToggle() {
  rankingSortToggle.querySelectorAll(".segmented-btn").forEach((btn) => {
    const on = btn.dataset.sort === rankingSort;
    btn.classList.toggle("current", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  rankingTableBody
    .closest("table")
    .querySelectorAll("th[data-sort]")
    .forEach((th) => th.classList.toggle("sorted", th.dataset.sort === rankingSort));
}

function renderRankingArea() {
  const results = buildResults();
  const shops = aggregateByShop(results, rankingSort);
  renderRankingSortToggle();
  rankingEmpty.hidden = shops.length > 0;
  rankingArea.hidden = shops.length === 0;
  // 共有できるのは画面に出している順位そのもの。取り違えが起きないよう、
  // 描画に使ったものをそのまま共有側へ渡す
  rankingShareStats = buildRankingShareStats(results, shops);
  if (shops.length === 0) {
    rankingTableBody.innerHTML = "";
    return;
  }

  const shown = shops.slice(0, RANKING_LIMIT);
  rankingStats.textContent =
    `ショップ: ${shops.length}件` +
    (shops.length > shown.length ? ` (上位${shown.length}件を表示)` : "");

  // 金額を読めなかった商品を0として足すと、少ない額を正しい合計に見せてしまう
  const unknown = shops.reduce((sum, row) => sum + row.unknown, 0);
  rankingUnknown.hidden = unknown === 0;
  if (unknown > 0) {
    rankingUnknown.textContent =
      `金額を読み取れなかった商品が${unknown}点あります。その分は合計金額に入っていません。`;
  }

  rankingTableBody.innerHTML = "";
  shown.forEach((row, index) => {
    const rank = index + 1;
    const tr = el("tr");
    if (rank <= RANKING_BOLD) tr.classList.add("rank-top");
    tr.appendChild(rankCell(rank));
    tr.appendChild(shopNameCell(row));
    tr.appendChild(countCell(row.count, row.giftCount));
    tr.appendChild(amountCell(row.total, row.gift));
    rankingTableBody.appendChild(tr);
  });
}

function trendSummaryCard(label, value, note, className) {
  const card = el("div", `trend-summary-card${className ? ` ${className}` : ""}`);
  card.appendChild(el("span", "trend-summary-label", label));
  card.appendChild(el("strong", "trend-summary-value", value));
  if (note) card.appendChild(el("span", "trend-summary-note", note));
  return card;
}

function barHeight(amount, max) {
  if (amount <= 0 || max <= 0) return 0;
  return Math.max(3, (amount / max) * 100);
}

function svgEl(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    node.setAttribute(name, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function trendPoints(months, key, max, limit = 12) {
  const left = 48;
  const top = 24;
  const width = 640;
  const height = 176;
  const ceiling = max || 1;
  return months
    .slice(0, limit)
    .map((month, index) => {
      const x = left + (width * index) / 11;
      const y = top + height - (height * month[key]) / ceiling;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderCumulativeChart(trend) {
  cumulativeTrendChart.innerHTML = "";
  cumulativeTrendChart.setAttribute(
    "aria-label",
    `${trend.year}年と${trend.previousYear}年の年間累計支出`
  );
  cumulativeTrendChart.appendChild(
    svgEl("title", {}, `${trend.year}年と${trend.previousYear}年の年間累計支出`)
  );

  const gridValues = [0, 0.5, 1];
  for (const ratio of gridValues) {
    const y = 200 - 176 * ratio;
    cumulativeTrendChart.appendChild(
      svgEl("line", { x1: 48, y1: y, x2: 688, y2: y, class: "trend-grid-line" })
    );
    cumulativeTrendChart.appendChild(
      svgEl(
        "text",
        { x: 42, y: y + 4, class: "trend-axis-value", "text-anchor": "end" },
        formatYen(Math.round(trend.maxCumulative * ratio))
      )
    );
  }

  for (let index = 0; index < 12; index++) {
    const x = 48 + (640 * index) / 11;
    cumulativeTrendChart.appendChild(
      svgEl("text", { x, y: 226, class: "trend-axis-month", "text-anchor": "middle" }, index + 1)
    );
  }

  cumulativeTrendChart.appendChild(
    svgEl("polyline", {
      class: "trend-line previous",
      points: trendPoints(trend.months, "previousCumulative", trend.maxCumulative),
    })
  );
  cumulativeTrendChart.appendChild(
    svgEl("polyline", {
      class: "trend-line current",
      points: trendPoints(
        trend.months,
        "currentCumulative",
        trend.maxCumulative,
        trend.throughMonth
      ),
    })
  );
}

function renderSpendingTrends(now = new Date()) {
  const results = buildResults();
  const valid = results.filter((result) => typeof result.amount === "number");
  trendsEmpty.hidden = valid.length > 0;
  trendsArea.hidden = valid.length === 0;
  if (valid.length === 0) {
    trendSummary.innerHTML = "";
    monthlyTrendChart.innerHTML = "";
    cumulativeTrendChart.innerHTML = "";
    trendPeriodTableBody.innerHTML = "";
    return;
  }

  const trend = buildSpendingTrend(results, now.getFullYear(), now.getMonth() + 1);
  trendCurrentYearLabel.textContent = `${trend.year}年`;
  trendPreviousYearLabel.textContent = `${trend.previousYear}年`;

  trendSummary.innerHTML = "";
  trendSummary.appendChild(
    trendSummaryCard(
      `${trend.year}年 1〜${trend.throughMonth}月`,
      formatYen(trend.currentToDate),
      "収集済みの支払額"
    )
  );
  trendSummary.appendChild(
    trendSummaryCard(
      `${trend.previousYear}年 同期間`,
      formatYen(trend.previousToDate),
      "前年の1月から同じ月まで"
    )
  );
  const differenceClass =
    trend.difference > 0 ? "increase" : trend.difference < 0 ? "decrease" : "";
  const differenceText =
    trend.difference > 0
      ? `+${formatYen(trend.difference)}`
      : trend.difference < 0
        ? `-${formatYen(Math.abs(trend.difference))}`
        : formatYen(0);
  const rateText =
    trend.rate === null
      ? "前年同期が0円のため割合は算出できません"
      : `前年同期比 ${trend.rate > 0 ? "+" : ""}${trend.rate.toFixed(1)}%`;
  trendSummary.appendChild(
    trendSummaryCard("前年同期との差", differenceText, rateText, differenceClass)
  );

  monthlyTrendChart.innerHTML = "";
  monthlyTrendChart.setAttribute(
    "aria-label",
    `${trend.year}年と${trend.previousYear}年の月ごとの支出比較`
  );
  for (const month of trend.months) {
    const group = el("div", "trend-month");
    const bars = el("div", "trend-bar-pair");
    for (const [key, label] of [
      ["current", `${trend.year}年${month.month}月`],
      ["previous", `${trend.previousYear}年${month.month}月`],
    ]) {
      const bar = el("span", `trend-bar ${key}`);
      bar.style.height = `${barHeight(month[key], trend.maxMonthly)}%`;
      bar.title = `${label}: ${formatYen(month[key])}`;
      bar.setAttribute("aria-label", bar.title);
      bars.appendChild(bar);
    }
    group.appendChild(bars);
    group.appendChild(el("span", "trend-month-label", `${month.month}月`));
    monthlyTrendChart.appendChild(group);
  }

  renderCumulativeChart(trend);
  renderPeriodTableInto(
    trendPeriodTableBody,
    aggregateByPeriod(results),
    expandedTrendPeriodYears
  );
}

// 引っ越しの画面。何を持ち出せるのかが分かれば十分なので、件数と期間だけを出す
function renderBackupArea() {
  const results = buildResults();
  const collected = results.filter((r) => !needsCollect(state.cache[r.id]));
  const dated = results
    .map((r) => parseOrderDate(r.date))
    .filter(Boolean)
    .sort((a, b) => a.sortKey - b.sortKey);

  // 実行中の無効化を上書きしないよう、待機中だけ件数で決める(renderClearArea と同じ)
  if (!running) backupSaveBtn.disabled = results.length === 0;
  if (results.length === 0) {
    backupStats.textContent = "保存できるデータがありません";
    backupCoverage.hidden = true;
    return;
  }

  const period =
    dated.length > 0
      ? ` / 期間: ${dateLabel(dated[0])} 〜 ${dateLabel(dated[dated.length - 1])}`
      : "";
  backupStats.textContent =
    `注文: ${results.length}件(収集済み ${collected.length}件 / ` +
    `未収集 ${results.length - collected.length}件)${period}`;

  backupCoverage.hidden = false;
  const complete = indexIsComplete(state.index);
  backupCoverage.classList.toggle("warn", !complete);
  backupCoverage.textContent = complete
    ? "注文履歴の取得済みの範囲: 全期間"
    : "注文履歴の取得済みの範囲: 途中まで(この状態のまま保存されます)";
}

function dateLabel(d) {
  return d.day > 0 ? `${d.year}年${d.month}月${d.day}日` : `${d.year}年${d.month}月`;
}

// データ出力の画面。CSVそのものは押されたときに組み立てるが、
// 何件書き出せるのかと、お支払金額と商品合計にずれがあるかはここで示す
function renderExportArea() {
  const results = buildResults();
  const withItems = results.filter((r) => Array.isArray(r.items));
  const itemCount = withItems.reduce((sum, r) => sum + r.items.length, 0);

  exportEmpty.hidden = results.length > 0;
  exportArea.hidden = results.length === 0;
  exportOrdersBtn.disabled = results.length === 0;
  exportItemsBtn.disabled = results.length === 0;
  if (results.length === 0) {
    exportPreviewBody.innerHTML = "";
    return;
  }

  exportStats.textContent =
    `注文: ${results.length}件 / 商品明細のある注文: ${withItems.length}件 / 商品: ${itemCount}行` +
    (withItems.length < results.length
      ? ` (明細を取れていない注文が${results.length - withItems.length}件あります)`
      : "");

  // お支払金額を商品合計と送料で説明しきれない注文。クーポンやポイントなど、
  // まだ拾えていないものがあるとここに出る
  const gaps = results.filter((r) => {
    const gap = amountGapOf(r);
    return gap !== null && gap !== 0;
  });
  exportGap.hidden = gaps.length === 0;
  exportGap.classList.toggle("warn", gaps.length > 0);
  if (gaps.length > 0) {
    exportGap.textContent =
      `お支払金額を商品合計と送料で説明しきれない注文が${gaps.length}件あります。` +
      "CSVの「差額」列で内容を確認できます(クーポンやポイントなどが考えられます)。";
  }

  exportPreviewBody.innerHTML = "";
  const preview = [];
  for (const r of withItems) {
    for (const item of r.items) {
      if (preview.length >= 10) break;
      preview.push(item);
    }
    if (preview.length >= 10) break;
  }
  for (const item of preview) {
    const tr = el("tr");
    tr.appendChild(td(item.shop));
    tr.appendChild(td(item.name));
    tr.appendChild(td(typeof item.price === "number" ? formatYen(item.price) : "—", "num"));
    tr.appendChild(td(typeof itemQuantity(item) === "number" ? itemQuantity(item) : "—", "num"));
    tr.appendChild(td(typeof item.boost === "number" ? formatYen(item.boost) : "—", "num"));
    tr.appendChild(td(item.gift ? "はい" : ""));
    exportPreviewBody.appendChild(tr);
  }
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
    // 途中で終わった索引は、次に「注文履歴を取得」を押せば抜けた範囲まで辿り直す。
    // 全件再取得を案内すると、必要のない取り直しをさせることになる
    indexCoverage.textContent = oldest
      ? `取得済みの範囲: 最新 〜 ${oldest.date} (途中で終了したため、これより古い注文は取得できていません。もう一度「注文履歴を取得」を押すと、抜けている範囲を取得します)`
      : "取得途中で終了したため、範囲が確定していません。もう一度「注文履歴を取得」を押してください";
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

  // 拡張の更新で保存項目が増えると、収集済みだった注文が取り直しの対象に戻る。
  // 何も操作していないのに未収集が増えたように見えると、不具合と区別が付かない
  const outdated = targetOrders().filter((o) => {
    const entry = state.cache[o.id];
    // 未収集や取得失敗は別の案内があるので、ここでは版数だけを理由にする
    return entry && entry.amount !== null && hasItems(entry) && isOutdatedEntry(entry);
  }).length;
  outdatedArea.hidden = outdated === 0;
  if (outdated > 0) {
    outdatedCount.textContent =
      `拡張機能の更新で、注文詳細から保存する項目が増えました。` +
      `以前の版で収集した${outdated}件を取り直します(金額の集計は今のままで、` +
      `商品明細・数量・送料が増えます)。`;
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
  const inThisYear = (rows) =>
    rows.filter((r) => {
      const d = parseOrderDate(r.date);
      return d !== null && d.year === thisYear;
    });
  const valid = results.filter((r) => typeof r.amount === "number");
  const ofThisYear = inThisYear(valid);
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
    // 共有してよい範囲の判定に使う。未収集が残っていたり索引が最古まで
    // 揃っていなかったりすると、合計は実際より少ない額になる
    pendingCount: results.length - valid.length,
    yearPendingCount: inThisYear(results).length - ofThisYear.length,
    indexComplete: indexIsComplete(state.index),
  };
}

function renderPeriodTable(results) {
  renderPeriodTableInto(periodTableBody, aggregateByPeriod(results), expandedPeriodYears);
}

// レポート画面と支出推移画面で、まったく同じ年別・月別集計を使う。
// 表ごとに開閉状態だけを分け、集計条件と行の組み立ては共有する。
function renderPeriodTableInto(tbody, periodStats, expandedKeys) {
  const amountRow = (className, label, row) => {
    const tr = el("tr", className);
    tr.appendChild(label);
    tr.appendChild(td(`${row.count}件`, "num"));
    tr.appendChild(amountCell(row.total, row.gift));
    return tr;
  };
  renderCollapsibleTable(
    tbody,
    periodStats,
    expandedKeys,
    (year, expanded) => amountRow("year-row", toggleCell(year.label, expanded), year),
    // 年は親の行に出ているので、月は「5月」とだけ書く
    (month) => amountRow("month-row", td(month.shortLabel), month)
  );
}

// 金額は読めているのに取り直しの対象になっている理由。無ければ空文字
function collectNote(entry) {
  if (!hasItems(entry)) return "明細なし";
  if (isOutdatedEntry(entry)) return "要再取得";
  return "";
}

function renderOrderTable(results) {
  orderTableBody.innerHTML = "";
  const sorted = [...results].sort((a, b) => orderSortKey(b) - orderSortKey(a));
  for (const r of sorted) {
    const tr = el("tr");
    tr.appendChild(td(r.date));
    tr.appendChild(td(STATUS_LABELS[r.status] || r.status));
    if (typeof r.amount === "number") {
      const cell = amountCell(r.amount, giftAmount(r));
      // 金額は読めたが取り直しの対象になっている注文。月別表では未収集として
      // 数えているので、内訳でも黙って収集済みには見せない
      const note = collectNote(r);
      if (note) {
        cell.insertBefore(el("span", "amount-pending", note), cell.firstChild);
      }
      tr.appendChild(cell);
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

// 合計以下の項目から最も高いものを選ぶ。マスターは金額の昇順で管理する。
// 最も安い項目にも届かない額のときは、何を選んでも「買えるくらい」が嘘になるので選ばない
function purchaseComparison(amount) {
  let selected = null;
  for (const example of PURCHASE_EXAMPLE_MASTER) {
    if (example.amount > amount) break;
    selected = example;
  }
  return selected ? selected.label : null;
}

// 全期間の合計を名乗ってよいのは、索引が最古まで揃っていて、かつ未収集も
// 残っていないときだけ。どちらか欠けたまま出すと、実際より少ない額を
// 「合計」として外に出すことになる
function canShareTotal(stats) {
  return stats.indexComplete && stats.pendingCount === 0;
}

// 合計を出せないときの確認文面。今年分は共有の前に収集してしまう
function shareConfirmMessage(stats) {
  const head = "未収集の注文が残っているため、全期間の合計は実際より少なくなります。\n";
  return stats.yearPendingCount > 0
    ? `${head}今年分の未収集 ${stats.yearPendingCount}件 を取得してから、今年の金額だけを共有します。\nよろしいですか?`
    : `${head}今年の金額だけを共有します。\nよろしいですか?`;
}

function buildShareText(stats) {
  // 合計を出せないときは今年の分だけにする。比較の基準も出した額に合わせないと、
  // 文面に無い金額をもとに「これが買える」と言うことになってしまう
  const full = canShareTotal(stats);
  const basis = full ? stats.total : stats.yearTotal;
  const comparison = purchaseComparison(basis);
  return [
    "BOOTHお買いもの振り返り🛍️",
    "",
    ...(full ? [`合計：${formatYen(stats.total)}（${stats.count}件）`] : []),
    `今年：${formatYen(stats.yearTotal)}（${stats.yearCount}件）`,
    // 比較できる額に届かないときは、この一段落ごと落とす
    ...(comparison
      ? ["", `積み重なって、${comparison}が買えるくらいの金額になったようですね`]
      : []),
    "",
    SHARE_HASHTAG,
  ].join("\n");
}

// ---- ランキングの共有 --------------------------------------------------

// 文面に載せる順位。表は10位まで出すが、投稿は長くなると読まれないので絞る
const RANKING_SHARE_LIMIT = 5;
const RANKING_MEDALS = ["🥇", "🥈", "🥉"];

// 描画に使った並びをそのまま持ち回る。共有のときに集計し直すと、
// 画面に出ている順位と違うものを外に出しかねない
function buildRankingShareStats(results, shops) {
  return {
    sort: rankingSort,
    rows: shops.slice(0, RANKING_SHARE_LIMIT),
    shopCount: shops.length,
    // 順位が実際とずれる原因。共有の前に断るために持っておく
    pending: results.filter((r) => needsCollect(state.cache[r.id])).length,
    unknown: shops.reduce((sum, row) => sum + row.unknown, 0),
    indexComplete: indexIsComplete(state.index),
  };
}

// 順位がずれうる理由。無ければ空配列で、そのまま共有してよい
function rankingShareIssues(stats) {
  const issues = [];
  if (stats.pending > 0) issues.push(`未収集の注文が${stats.pending}件あります`);
  if (!stats.indexComplete) issues.push("注文履歴の取得が途中で終わっています");
  // 金額を読めなかった商品は点数には入っているので、購入数編では順位に響かない
  if (stats.sort === "amount" && stats.unknown > 0) {
    issues.push(`金額を読み取れなかった商品が${stats.unknown}点あります`);
  }
  return issues;
}

function rankingShareConfirmMessage(stats) {
  return (
    `${rankingShareIssues(stats).join("。")}。\n` +
    "このまま共有すると、順位や数字が実際とは違うことがあります。\n" +
    "よろしいですか?"
  );
}

function rankingShareValue(row, sort) {
  return sort === "count" ? `${row.count}点` : formatYen(row.total);
}

function buildRankingShareText(stats, hideNumbers) {
  const label = RANKING_SORT_LABELS[stats.sort];
  return [
    `BOOTHの推し作者ランキング🛍️（${label}）`,
    "",
    ...stats.rows.map((row, index) => {
      const rank = RANKING_MEDALS[index] || `${index + 1}.`;
      return hideNumbers
        ? `${rank} ${row.name}`
        : `${rank} ${row.name} ${rankingShareValue(row, stats.sort)}`;
    }),
    // 画面では断り書きを出している。数字を外に出すときは文面にも同じ断りを付ける
    ...(hideNumbers || stats.sort !== "amount"
      ? []
      : ["", "※金額は商品の合計（送料・クーポンを除く）"]),
    "",
    SHARE_HASHTAG,
  ].join("\n");
}

// フッターの共有ボタンは開いている画面によって共有するものが変わる。
// ボタンの文言も変えないと、何が投稿されるのか押すまで分からない
function shareMode() {
  return viewFromHash(location.hash) === "ranking" ? "ranking" : "total";
}

function updateShareButton() {
  if (shareMode() === "ranking") {
    shareBtn.textContent = "𝕏でランキングを共有";
    shareBtn.disabled = !rankingShareStats || rankingShareStats.rows.length === 0;
    return;
  }
  shareBtn.textContent = "𝕏で共有";
  // 今年分に未収集があるなら、押したあとに収集してから共有できる
  shareBtn.disabled =
    !shareStats || (shareStats.count === 0 && shareStats.yearPendingCount === 0);
}
