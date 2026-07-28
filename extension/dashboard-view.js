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
const allPlannedCountEl = document.getElementById("allPlannedCount");
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
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const orderSort = document.getElementById("orderSort");
const orderFilterCount = document.getElementById("orderFilterCount");
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
const heatmapFrom = document.getElementById("heatmapFrom");
const heatmapTo = document.getElementById("heatmapTo");
const heatmapAllBtn = document.getElementById("heatmapAllBtn");
const heatmapStats = document.getElementById("heatmapStats");
const heatmapEmpty = document.getElementById("heatmapEmpty");
const heatmapGrid = document.getElementById("heatmapGrid");
const heatmapSkipped = document.getElementById("heatmapSkipped");
const trendYear = document.getElementById("trendYear");
const trendBaseYear = document.getElementById("trendBaseYear");
const orderTableBody = document.getElementById("orderTableBody");
const noticeBox = document.getElementById("noticeBox");
const errorBox = document.getElementById("errorBox");
const menuBtn = document.getElementById("menuBtn");
const navDrawer = document.getElementById("navDrawer");
const navOverlay = document.getElementById("navOverlay");
const authorBtn = document.getElementById("authorBtn");
const authorOverlay = document.getElementById("authorOverlay");
const authorPanel = document.getElementById("authorPanel");
const authorCloseBtn = document.getElementById("authorCloseBtn");
const authorPortrait = document.getElementById("authorPortrait");
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
const summaryEmpty = document.getElementById("summaryEmpty");
const summaryArea = document.getElementById("summaryArea");
const summaryYear = document.getElementById("summaryYear");
const summaryCards = document.getElementById("summaryCards");
const summaryNewShopWarn = document.getElementById("summaryNewShopWarn");
const summaryTopShopsBody = document.getElementById("summaryTopShopsBody");
const rankingSortToggle = document.getElementById("rankingSortToggle");
const rankingHideNumbers = document.getElementById("rankingHideNumbers");
const pendingBanner = document.getElementById("pendingBanner");
const pendingBannerText = document.getElementById("pendingBannerText");
const backupStats = document.getElementById("backupStats");
const backupCoverage = document.getElementById("backupCoverage");
const backupSaveBtn = document.getElementById("backupSaveBtn");
const restoreFile = document.getElementById("restoreFile");
const restoreStatus = document.getElementById("restoreStatus");
const shareOverlay = document.getElementById("shareOverlay");
const sharePanel = document.getElementById("sharePanel");
const shareCloseBtn = document.getElementById("shareCloseBtn");
const shareCanvas = document.getElementById("shareCanvas");
const shareRatioToggle = document.getElementById("shareRatioToggle");
const shareScaleInput = document.getElementById("shareScale");
const shareScaleValue = document.getElementById("shareScaleValue");
const shareDropZone = document.getElementById("shareDropZone");
const shareColors = document.getElementById("shareColors");
const sharePatterns = document.getElementById("sharePatterns");
const shareBgFile = document.getElementById("shareBgFile");
const shareBgClearBtn = document.getElementById("shareBgClearBtn");
const shareBgName = document.getElementById("shareBgName");
const shareText = document.getElementById("shareText");
const shareCopyBtn = document.getElementById("shareCopyBtn");
const shareSaveBtn = document.getElementById("shareSaveBtn");
const shareOpenBtn = document.getElementById("shareOpenBtn");
const shareCardStatus = document.getElementById("shareCardStatus");

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

const VIEW_NAMES = ["report", "ranking", "trends", "summary", "export", "backup"];
const DEFAULT_VIEW = "report";
// 見出しの右に添える画面名。既定の画面では何も足さない
const VIEW_TITLES = {
  report: "",
  ranking: "推し作者ランキング",
  trends: "支出推移・前年比較",
  summary: "今年のまとめ",
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

function setDrawerOpen(open, returnFocus = true) {
  navDrawer.hidden = !open;
  navOverlay.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = navDrawer.querySelector(".nav-link");
    if (first) first.focus();
  } else if (returnFocus) {
    menuBtn.focus();
  }
}

function drawerIsOpen() {
  return !navDrawer.hidden;
}

let authorReturnFocus = null;

function authorModalBackgroundElements() {
  return Array.from(document.body.children).filter(
    (element) => element !== authorOverlay && element !== authorPanel && element.tagName !== "SCRIPT"
  );
}

function setAuthorModalBackgroundInert(inert) {
  for (const element of authorModalBackgroundElements()) element.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function authorPanelFocusableElements() {
  return Array.from(authorPanel.querySelectorAll('button:not([disabled]), a[href]')).filter(
    (element) => element.getClientRects().length > 0 || document.body.dataset.noAutoInit !== undefined
  );
}

function trapAuthorPanelFocus(event) {
  if (event.key !== "Tab" || authorPanel.hidden) return;
  const focusable = authorPanelFocusableElements();
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openAuthorPanel() {
  authorReturnFocus = menuBtn;
  setDrawerOpen(false, false);
  authorOverlay.hidden = false;
  authorPanel.hidden = false;
  setAuthorModalBackgroundInert(true);
  authorCloseBtn.focus();
}

function closeAuthorPanel() {
  if (authorPanel.hidden) return;
  authorOverlay.hidden = true;
  authorPanel.hidden = true;
  setAuthorModalBackgroundInert(false);
  if (authorReturnFocus) authorReturnFocus.focus();
  authorReturnFocus = null;
}

// 折りたたみ表で開いている年。再描画のたびに行を作り直すため、
// 開閉状態はDOMではなくこちらで持つ(表ごとに1つ)
const expandedMonthYears = new Set();
const expandedPeriodYears = new Set();
const expandedTrendPeriodYears = new Set();

// 共有文面に使う集計値(描画のたびに更新する)
let shareStats = null;
let rankingShareStats = null;
let summaryShareStats = null;

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
  const button = el("button", "table-toggle");
  button.type = "button";
  button.setAttribute("aria-expanded", String(expanded));
  button.appendChild(el("span", "toggle", expanded ? "▾" : "▸"));
  button.appendChild(el("span", "table-toggle-label", label));
  cell.appendChild(button);
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

    const controlledIds = [];
    for (const [monthIndex, month] of year.months.entries()) {
      const monthRow = buildMonthRow(month, year);
      if (!monthRow) continue;
      monthRow.dataset.yearKey = year.key;
      monthRow.id = `${tbody.id}-${year.key || "unknown"}-${monthIndex}`;
      controlledIds.push(monthRow.id);
      monthRow.hidden = !expanded;
      tbody.appendChild(monthRow);
    }
    const toggle = yearRow.querySelector(".table-toggle");
    if (toggle && controlledIds.length > 0) {
      toggle.setAttribute("aria-controls", controlledIds.join(" "));
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
  const button = yearRow.querySelector(".table-toggle");
  button.querySelector(".toggle").textContent = expanded ? "▸" : "▾";
  button.setAttribute("aria-expanded", String(!expanded));
  tbody
    .querySelectorAll(`tr.month-row[data-year-key="${key}"]`)
    .forEach((row) => {
      row.hidden = expanded;
    });
}

// ---- 進捗・通知 --------------------------------------------------------

// 実行中は操作を止める。running そのものは dashboard.js が持つ
function renderRunningState(isRunning) {
  const main = document.querySelector("main");
  if (main) main.setAttribute("aria-busy", String(isRunning));
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
    progressBox.removeAttribute("aria-valuenow");
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
    const percent = Math.min(100, Math.max(0, ratio * 100));
    progressFill.style.width = `${percent}%`;
    progressBox.setAttribute("aria-valuenow", String(Math.round(percent)));
  } else {
    progressBox.removeAttribute("aria-valuenow");
  }
}

// ---- 描画 --------------------------------------------------------------

function render() {
  renderIndexStatus();
  renderMonthArea();
  renderResult();
  renderSpendingTrends();
  updatePlannedCount();
  renderClearArea();
  renderRankingArea();
  renderYearSummary();
  renderExportArea();
  renderBackupArea();
  // 出し分けと共有ボタンは上の描画結果に依るので最後に決める。
  // renderCurrentView が共有ボタンまで更新するので、ここで呼ぶのは1回でよい
  renderCurrentView();
}

// ---- 推し作者ランキング ------------------------------------------------

// 上位何位まで出すか。王冠を付ける順位と、太字にする順位
const RANKING_LIMIT = 10;
const RANKING_CROWNS = 3;
const RANKING_BOLD = 5;

// 金額編・購入数編のどちらで並べているか。再描画で作り直す表には残せないので
// ここで持つ(開いている年の集合と同じ扱い)
let rankingSort = DEFAULT_SHOP_SORT;

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

function rankCell(rank, expanded, detailsId, shopName) {
  const cell = td("", "rank");
  const button = el("button", "table-toggle rank-toggle");
  button.type = "button";
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-controls", detailsId);
  button.setAttribute("aria-label", `${shopName}の商品明細を${expanded ? "閉じる" : "開く"}`);
  const badge = el("span", "rank-badge", String(rank));
  // 1〜3位は王冠を背景に敷く(金・銀・銅)
  if (rank <= RANKING_CROWNS) badge.classList.add(`rank-crown-${rank}`);
  button.appendChild(badge);
  // 何が買えるのか押す前に分かるよう、開閉できることを三角で示す
  button.appendChild(el("span", "toggle", expanded ? "▾" : "▸"));
  cell.appendChild(button);
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
      `金額を読み取れなかった商品が${unknown}点あります。その分は合計額に入っていません。`;
  }

  renderShopRows(rankingTableBody, shown, RANKING_BOLD);
}

// 順位をクリックすると、そのショップで買った商品が下に開く。
// 開いているショップは表を作り直しても保つ(並べ替えのたびに閉じると探し直しになる)
const expandedShopKeys = new Set();

// ランキングとまとめで同じ形の行を出す。片方だけ列や飾りが違うと、
// 見比べたときに別のものを数えているように見える
function renderShopRows(tbody, shops, boldUntil) {
  tbody.innerHTML = "";
  shops.forEach((row, index) => {
    const expanded = expandedShopKeys.has(row.key);
    const detailsId = `${tbody.id}-shop-details-${index}`;
    const tr = el("tr", index < boldUntil ? "shop-row rank-top" : "shop-row");
    tr.dataset.shopKey = row.key;
    tr.appendChild(rankCell(index + 1, expanded, detailsId, row.name));
    tr.appendChild(shopNameCell(row));
    tr.appendChild(countCell(row.count, row.giftCount));
    tr.appendChild(amountCell(row.total, row.gift));
    tbody.appendChild(tr);
    const itemsRow = shopItemsRow(row, expanded);
    itemsRow.id = detailsId;
    tbody.appendChild(itemsRow);
  });
}

// 同じ商品を複数の注文で買っていると重複するので、名前でまとめたものを出す
// (集合にする側は aggregateByShop が担う)
function shopItemsRow(row, expanded) {
  const tr = el("tr", "shop-items-row");
  tr.dataset.shopKey = row.key;
  tr.hidden = !expanded;

  const cell = td("", "shop-items");
  cell.colSpan = 4;
  if (row.items.length === 0) {
    cell.appendChild(el("span", "hint", "商品の明細がありません"));
  } else {
    const list = el("ul", "shop-item-list");
    for (const name of row.items) list.appendChild(el("li", "", name));
    cell.appendChild(list);
    cell.appendChild(el("span", "hint", `${row.items.length}種類`));
  }
  tr.appendChild(cell);
  return tr;
}

// ランキングとまとめの両方に同じショップが出るので、開閉は表をまたいで反映する。
// 片方だけ開くと、行き来したときに開いたはずのものが閉じて見える
function toggleShopItems(key) {
  const expanded = expandedShopKeys.has(key);
  if (expanded) {
    expandedShopKeys.delete(key);
  } else {
    expandedShopKeys.add(key);
  }
  const selector = `[data-shop-key="${CSS.escape(key)}"]`;
  document.querySelectorAll(`tr.shop-items-row${selector}`).forEach((tr) => {
    tr.hidden = expanded;
  });
  document.querySelectorAll(`tr.shop-row${selector} .rank-toggle`).forEach((button) => {
    button.querySelector(".toggle").textContent = expanded ? "▸" : "▾";
    button.setAttribute("aria-expanded", String(!expanded));
    const shopName = button.getAttribute("aria-label").replace(/の商品明細を(?:開く|閉じる)$/, "");
    button.setAttribute("aria-label", `${shopName}の商品明細を${expanded ? "開く" : "閉じる"}`);
  });
}

// ---- 今年のまとめ ------------------------------------------------------

// 選んでいる年。注文の無い年は選べないので、描画のたびに実在する年へ寄せる
let summarySelectedYear = null;

function setSummaryYear(year) {
  const value = Number(year);
  if (!Number.isFinite(value) || value === summarySelectedYear) return;
  summarySelectedYear = value;
  renderYearSummary();
  // 共有ボタンには年が入っているので、選び直したら文言も追従させる
  updateShareButton();
}

// 1月に見ると去年を振り返りたいので、今年に注文が無ければ最も新しい年へ落とす
function resolveSummaryYear(years) {
  if (years.includes(summarySelectedYear)) return summarySelectedYear;
  const thisYear = new Date().getFullYear();
  return years.includes(thisYear) ? thisYear : years[0];
}

// 年を選ぶプルダウンは、まとめと支出推移の両方で使う。
// 中身が同じなら作り直さない(開いたまま再描画すると選択が閉じてしまう)
function renderYearOptions(select, years, selected) {
  const same =
    select.options.length === years.length &&
    years.every((year, index) => select.options[index].value === String(year));
  if (!same) {
    select.innerHTML = "";
    for (const year of years) {
      select.appendChild(el("option", "", `${year}年`)).value = String(year);
    }
  }
  select.value = String(selected);
}

function renderYearSummary() {
  const results = buildResults();
  const years = orderYears(results);
  summaryEmpty.hidden = years.length > 0;
  summaryArea.hidden = years.length === 0;
  if (years.length === 0) {
    summaryCards.innerHTML = "";
    summaryTopShopsBody.innerHTML = "";
    summaryShareStats = null;
    return;
  }

  summarySelectedYear = resolveSummaryYear(years);
  renderYearOptions(summaryYear, years, summarySelectedYear);
  const stats = buildYearSummary(results, summarySelectedYear);
  // 共有するのは画面に出したものそのもの。共有時に集計し直さない
  summaryShareStats = stats;

  // 未収集はまとめの数字を実際より少なくする。合計のすぐ横で断る
  const totalNote = [`注文${stats.orderCount}件`];
  if (stats.gift > 0) totalNote.push(`ギフト ${formatYen(stats.gift)}`);
  if (stats.pendingCount > 0) totalNote.push(`未収集${stats.pendingCount}件`);
  if (stats.detailPendingCount > 0) {
    totalNote.push(`商品明細未収集${stats.detailPendingCount}件`);
  }

  const cards = [
    [`${stats.year}年の合計額`, formatYen(stats.total), totalNote.join(" / ")],
    ["買ったもの", `${stats.itemCount}点`, giftCountText(stats.giftItemCount)],
    [
      "支援した作者",
      `${stats.shopCount}人`,
      stats.newShopCount > 0 ? `はじめて ${stats.newShopCount}人` : "",
    ],
  ];
  if (stats.busiestMonth) {
    cards.push([
      "いちばん買った月",
      monthLabel(stats.busiestMonth.key),
      formatYen(stats.busiestMonth.total),
    ]);
  }
  summaryCards.innerHTML = "";
  for (const [label, value, note] of cards) {
    summaryCards.appendChild(statCard(label, value, note));
  }

  // 現在年の明細不足は点数・作者数・順位を少なくし、過去の明細不足は
  // 以前から買っていた作者を「はじめて」と数える。どちらも数字の近くで断る。
  const summaryWarnings = [];
  if (stats.detailPendingCount > 0) {
    summaryWarnings.push(
      `${stats.year}年の注文に商品明細の未収集が${stats.detailPendingCount}件あります。` +
        "点数・作者数・推し作者は実際より少なくなることがあります。"
    );
  }
  if (stats.beforePending > 0) {
    summaryWarnings.push(
      `${stats.year}年より前の注文に未収集が${stats.beforePending}件あります。` +
        "その注文で買った作者は「はじめて」に数えてしまうことがあります。"
    );
  }
  summaryNewShopWarn.hidden = summaryWarnings.length === 0;
  summaryNewShopWarn.textContent = summaryWarnings.join(" ");

  renderShopRows(summaryTopShopsBody, stats.topShops, stats.topShops.length);
}

function statCard(label, value, note, className) {
  const card = el("div", `stat-card${className ? ` ${className}` : ""}`);
  card.appendChild(el("span", "stat-label", label));
  card.appendChild(el("strong", "stat-value", value));
  if (note) card.appendChild(el("span", "stat-note", note));
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
    `${trend.year}年と${trend.baseYear}年の年間累計支出`
  );
  cumulativeTrendChart.appendChild(
    svgEl("title", {}, `${trend.year}年と${trend.baseYear}年の年間累計支出`)
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

// 比較する2つの年。null は「まだ選んでいない(既定に任せる)」
let trendSelectedYear = null;
let trendSelectedBaseYear = null;

// 既定は今年と前年。注文が無い年は選べないので、実在する年へ寄せる
function resolveTrendYears(years, thisYear) {
  const year = years.includes(trendSelectedYear)
    ? trendSelectedYear
    : years.includes(thisYear)
      ? thisYear
      : years[0];
  const others = years.filter((candidate) => candidate !== year);
  const base = others.includes(trendSelectedBaseYear)
    ? trendSelectedBaseYear
    : others.includes(year - 1)
      ? year - 1
      : others[0];
  // 比べる相手が1つも無い(1年分しか買っていない)ときは前年を空として扱う
  return [year, base === undefined ? year - 1 : base];
}

function setTrendYears(year, baseYear) {
  trendSelectedYear = Number(year);
  trendSelectedBaseYear = Number(baseYear);
  renderSpendingTrends();
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

  const years = orderYears(results);
  const [year, baseYear] = resolveTrendYears(years, now.getFullYear());
  renderYearOptions(trendYear, years, year);
  // 同じ年どうしを比べても意味がないので、選んでいる年は相手側から外す
  renderYearOptions(
    trendBaseYear,
    years.filter((candidate) => candidate !== year),
    baseYear
  );

  // 今年は途中までしか買っていないので今月で切る。過ぎた年は12月まで見る
  const throughMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const trend = buildSpendingTrend(results, year, throughMonth, baseYear);
  trendCurrentYearLabel.textContent = `${trend.year}年`;
  trendPreviousYearLabel.textContent = `${trend.baseYear}年`;

  trendSummary.innerHTML = "";
  trendSummary.appendChild(
    statCard(
      `${trend.year}年 1〜${trend.throughMonth}月`,
      formatYen(trend.currentToDate),
      "収集済みの合計額"
    )
  );
  trendSummary.appendChild(
    statCard(
      `${trend.baseYear}年 同期間`,
      formatYen(trend.previousToDate),
      `${trend.baseYear}年の1月から同じ月まで`
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
      ? `${trend.baseYear}年の同期間が0円のため割合は算出できません`
      : `同期間比 ${trend.rate > 0 ? "+" : ""}${trend.rate.toFixed(1)}%`;
  trendSummary.appendChild(
    statCard(`${trend.baseYear}年との差`, differenceText, rateText, differenceClass)
  );

  monthlyTrendChart.innerHTML = "";
  monthlyTrendChart.setAttribute(
    "aria-label",
    `${trend.year}年と${trend.baseYear}年の月ごとの支出比較`
  );
  for (const month of trend.months) {
    const group = el("div", "trend-month");
    const bars = el("div", "trend-bar-pair");
    for (const [key, label] of [
      ["current", `${trend.year}年${month.month}月`],
      ["previous", `${trend.baseYear}年${month.month}月`],
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
  // 左で選んでいる年へ合わせてから描く
  syncHeatmapToYear(trend.year);
  renderHeatmap();
  renderPeriodTableInto(
    trendPeriodTableBody,
    aggregateByPeriod(results),
    expandedTrendPeriodYears
  );
}

// ---- 買った曜日と時間帯 ------------------------------------------------

// 選んでいる範囲。null は「全期間」
let heatmapFromKey = null;
let heatmapToKey = null;

// **比較する年を切り替えたら、この区画も同じ期間へ合わせる。**
// 別々に動くと、上のグラフが2025年なのに下は全期間、という食い違ったものを
// 並べて見比べることになる。合わせたあとに範囲や「全期間」を選び直せば
// そちらが残るので、年を切り替えたときだけ上書きする(同じ年での再描画では
// 触らない。収集が進むたびに手で選んだ範囲が戻ってしまう)
let heatmapSyncedYear = null;

function syncHeatmapToYear(year) {
  if (heatmapSyncedYear === year) return;
  heatmapSyncedYear = year;
  // **今年でも今月で切らず、1年間で見る。** ここで数えるのは曜日と時間帯の
  // 傾向なので、月をそろえる意味がない(上の年比較は金額を足し合わせるため、
  // 同じ月まででないと差が出てしまうので、あちらだけ今月で切る)。
  // その年に注文の無い月は clampMonthKey が実在する範囲へ寄せる
  heatmapFromKey = `${year}-01`;
  heatmapToKey = `${year}-12`;
}

function setHeatmapRange(from, to) {
  // 逆に選んでも同じ範囲として扱う(範囲指定の他の場所と同じ)
  heatmapFromKey = from && to && from > to ? to : from;
  heatmapToKey = from && to && from > to ? from : to;
  renderHeatmap();
}

function heatmapMonthKeys(results) {
  const keys = new Set();
  for (const result of results) {
    const key = monthKeyOf(result.date);
    if (key) keys.add(key);
  }
  return Array.from(keys).sort();
}

// 選択肢には**注文のある月しか無い**。年に合わせて 1月〜12月 を指定しても
// その月の注文が無ければ選べないので、範囲に入る最も近い月へ寄せる。
// 寄せずに渡すと select の値が空になり、件数が0件として出てしまう
function clampMonthKey(key, keys, edge) {
  if (!key) return edge === "from" ? keys[0] : keys[keys.length - 1];
  if (keys.includes(key)) return key;
  const inside =
    edge === "from"
      ? keys.find((candidate) => candidate >= key)
      : keys.filter((candidate) => candidate <= key).pop();
  // 範囲の中に1か月も無いときは端へ倒す(年の選択肢は注文のある年だけなので
  // 通常は起きないが、寄せ先が無いまま空を渡すよりは全期間の端が分かりやすい)
  return inside || (edge === "from" ? keys[0] : keys[keys.length - 1]);
}

function renderHeatmapRangeOptions(keys) {
  for (const [select, selected] of [
    [heatmapFrom, clampMonthKey(heatmapFromKey, keys, "from")],
    [heatmapTo, clampMonthKey(heatmapToKey, keys, "to")],
  ]) {
    const same =
      select.options.length === keys.length &&
      keys.every((key, index) => select.options[index].value === key);
    if (!same) {
      select.innerHTML = "";
      for (const key of keys) {
        select.appendChild(el("option", "", monthLabel(key))).value = key;
      }
    }
    select.value = selected;
  }
}

// 濃さは最大の回数を基準にする。1件でも薄く色を付けて、0件と見分けられるようにする
function heatmapCellAlpha(count, max) {
  if (count === 0) return 0;
  return 0.15 + (count / max) * 0.85;
}

function renderHeatmap() {
  const results = buildResults();
  const keys = heatmapMonthKeys(results);
  if (keys.length === 0) {
    heatmapGrid.innerHTML = "";
    heatmapEmpty.hidden = false;
    heatmapStats.textContent = "";
    heatmapSkipped.hidden = true;
    return;
  }
  renderHeatmapRangeOptions(keys);

  const stats = buildWeekdayHourStats(results, heatmapFrom.value, heatmapTo.value);
  heatmapEmpty.hidden = stats.counted > 0;
  heatmapGrid.hidden = stats.counted === 0;
  heatmapStats.textContent = stats.counted > 0 ? `${stats.counted}件` : "";
  heatmapSkipped.hidden = stats.skipped === 0;
  if (stats.skipped > 0) {
    heatmapSkipped.textContent =
      `注文日時から曜日または時刻を読み取れなかった注文が${stats.skipped}件あります。` +
      "この表には入っていません。";
  }
  if (stats.counted === 0) {
    heatmapGrid.innerHTML = "";
    return;
  }

  heatmapGrid.setAttribute(
    "aria-label",
    `曜日と時間帯ごとの注文件数(${monthLabel(heatmapFrom.value)}〜${monthLabel(heatmapTo.value)}、${stats.counted}件)`
  );
  heatmapGrid.innerHTML = "";
  // 左上は曜日の列の見出し分
  heatmapGrid.appendChild(el("span", "heatmap-corner"));
  for (let hour = 0; hour < 24; hour += 1) {
    // 24個すべて数字を出すと潰れるので、3時間おきに目印を置く
    heatmapGrid.appendChild(el("span", "heatmap-hour", hour % 3 === 0 ? String(hour) : ""));
  }
  stats.cells.forEach((row, weekday) => {
    heatmapGrid.appendChild(el("span", "heatmap-weekday", WEEKDAY_LABELS[weekday]));
    row.forEach((count, hour) => {
      const cell = el("span", "heatmap-cell");
      cell.style.backgroundColor = `rgba(252, 77, 80, ${heatmapCellAlpha(count, stats.max)})`;
      cell.title = `${WEEKDAY_LABELS[weekday]}曜 ${hour}時台: ${count}件`;
      heatmapGrid.appendChild(cell);
    });
  });
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
  if (!hasIndex) {
    monthEmpty.textContent = state.index && indexIsComplete(state.index)
      ? "購入履歴はありませんでした。集計する注文はありません。"
      : "先に「① 注文履歴を取得」を実行してください。";
    return;
  }

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
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${year.label}を収集範囲に設定`);
      return row;
    },
    (month, year) => {
      if (year.key === null) return null;
      const row = statRow(month, { className: "month-row", indent: true });
      row.dataset.monthKey = month.key;
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${month.label}を収集範囲に設定`);
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
function collectionTimeEstimate(count) {
  if (count <= 0) return "";
  // リクエスト間隔だけから出す最低目安。実際は通信時間も加わるため「以上」とする。
  const seconds = Math.max(1, Math.ceil((count * REQUEST_INTERVAL_MS) / 1000));
  if (seconds < 60) return `約${seconds}秒以上`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `約${minutes}分以上`;
}

function updatePlannedCount() {
  if (!state.index) {
    allPlannedCountEl.textContent = "所要時間は注文履歴の取得後に表示します";
  } else {
    const allPlanned = pendingTargets(targetOrders(), forceRefreshAll.checked).length;
    allPlannedCountEl.textContent =
      allPlanned > 0
        ? `金額取得: ${allPlanned}件 / 目安: ${collectionTimeEstimate(allPlanned)}`
        : "金額取得: なし（注文履歴のみ確認します）";
  }

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
    planned > 0
      ? `取得予定: ${planned}件 / 目安: ${collectionTimeEstimate(planned)}`
      : "取得予定: なし(収集済み)";
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

function orderShops(result) {
  const shops = new Map();
  if (!Array.isArray(result.items)) return [];
  for (const item of result.items) {
    const name = String(item.shop || "").trim();
    const url = String(item.shopUrl || "").trim();
    if (!name) continue;
    shops.set(url || name, { name, url });
  }
  return Array.from(shops.values());
}

function orderShopsLabel(result) {
  const names = orderShops(result).map((shop) => shop.name);
  return names.length > 0 ? names.join("、") : "—";
}

function orderShopsCell(result) {
  const cell = td("");
  const shops = orderShops(result);
  if (shops.length === 0) {
    cell.textContent = "—";
    return cell;
  }
  const links = el("div", "order-shop-links");
  for (const shop of shops) {
    if (SHOP_URL_PATTERN.test(shop.url)) {
      const link = el("a", null, shop.name);
      link.href = shop.url;
      link.target = "_blank";
      link.rel = "noopener";
      links.appendChild(link);
    } else {
      links.appendChild(el("span", "", shop.name));
    }
  }
  cell.appendChild(links);
  return cell;
}

function renderOrderStatusOptions(results) {
  const selected = orderStatusFilter.value;
  const statuses = Array.from(new Set(results.map((result) => result.status))).sort((a, b) =>
    (STATUS_LABELS[a] || a).localeCompare(STATUS_LABELS[b] || b, "ja")
  );
  orderStatusFilter.innerHTML = "";
  const all = el("option", "", "すべて");
  all.value = "";
  orderStatusFilter.appendChild(all);
  for (const status of statuses) {
    const option = el("option", "", STATUS_LABELS[status] || status);
    option.value = status;
    orderStatusFilter.appendChild(option);
  }
  orderStatusFilter.value = statuses.includes(selected) ? selected : "";
}

function compareOrderRows(a, b, sort) {
  if (sort === "date-asc") {
    const aDate = orderSortKey(a);
    const bDate = orderSortKey(b);
    // 日付不明は「古い」とは言えないため、昇順でも末尾へ送る。
    if (aDate < 0 || bDate < 0) {
      if (aDate < 0 && bDate < 0) return 0;
      return aDate < 0 ? 1 : -1;
    }
    return aDate - bDate;
  }
  if (sort === "shop-asc") {
    return orderShopsLabel(a).localeCompare(orderShopsLabel(b), "ja") ||
      orderSortKey(b) - orderSortKey(a);
  }
  if (sort === "amount-desc" || sort === "amount-asc") {
    const aValid = typeof a.amount === "number";
    const bValid = typeof b.amount === "number";
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && a.amount !== b.amount) {
      return sort === "amount-desc" ? b.amount - a.amount : a.amount - b.amount;
    }
  }
  return orderSortKey(b) - orderSortKey(a);
}

function renderOrderTable(results) {
  orderTableBody.innerHTML = "";
  renderOrderStatusOptions(results);
  const query = orderSearch.value.trim().toLocaleLowerCase("ja");
  const status = orderStatusFilter.value;
  const filtered = results.filter((result) => {
    if (status && result.status !== status) return false;
    if (!query) return true;
    return `${result.id} ${orderShopsLabel(result)}`.toLocaleLowerCase("ja").includes(query);
  });
  const sorted = [...filtered].sort((a, b) => compareOrderRows(a, b, orderSort.value));
  for (const r of sorted) {
    const tr = el("tr");
    tr.appendChild(td(r.date));
    tr.appendChild(td(STATUS_LABELS[r.status] || r.status));
    tr.appendChild(orderShopsCell(r));
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
  orderRowCountEl.textContent = `(${filtered.length === results.length
    ? `${results.length}件`
    : `${filtered.length}/${results.length}件`})`;
  orderFilterCount.textContent = filtered.length === results.length
    ? `${results.length}件を表示`
    : `${results.length}件中 ${filtered.length}件を表示`;
}

// ---- 共有 --------------------------------------------------------------

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

// フッターの共有ボタンは開いている画面によって共有するものが変わる。
// ボタンの文言も変えないと、何が投稿されるのか押すまで分からない
function shareMode() {
  const view = viewFromHash(location.hash);
  return view === "ranking" || view === "summary" ? view : "total";
}

function updateShareButton() {
  // パネルが開いている間は押しても何も起きない。押せる見た目のまま反応しないと
  // 壊れているように見えるので、閉じるまで無効にする
  if (!sharePanel.hidden) {
    shareBtn.disabled = true;
    return;
  }
  const mode = shareMode();
  if (mode === "ranking") {
    shareBtn.textContent = "𝕏でランキングを共有";
    shareBtn.disabled = !rankingShareStats || rankingShareStats.rows.length === 0;
    return;
  }
  if (mode === "summary") {
    // 何年のまとめが出るのかは、押す前に分かる必要がある
    shareBtn.textContent = summaryShareStats
      ? `𝕏で${summaryShareStats.year}年のまとめを共有`
      : "𝕏でまとめを共有";
    shareBtn.disabled = !summaryShareStats || summaryShareStats.orderCount === 0;
    return;
  }
  shareBtn.textContent = "𝕏で共有";
  // 今年分に未収集があるなら、押したあとに収集してから共有できる
  shareBtn.disabled =
    !shareStats || (shareStats.count === 0 && shareStats.yearPendingCount === 0);
}

// ---- 共有カードのパネル ------------------------------------------------
//
// 𝕏の投稿画面(intent)には画像を添付できない。URLで渡せるのは文面だけなので、
// 画像はここで作って保存かコピーをしてもらい、投稿画面へ本人に貼ってもらう。

// 押した時点の中身。背景を差し替えても同じ数字で描き直せるよう持っておく
let sharePayload = null;
// 選ばれた背景画像。タブの中だけで持ち、保存も送信もしない
let shareBackground = null;
let shareBackgroundTransform = { scale: 1, x: 0, y: 0 };

// 選んでいる縦横比
let shareRatio = DEFAULT_SHARE_RATIO;
let shareReturnFocus = null;

function shareModalBackgroundElements() {
  return Array.from(document.body.children).filter(
    (element) => element !== shareOverlay && element !== sharePanel && element.tagName !== "SCRIPT"
  );
}

function setShareModalBackgroundInert(inert) {
  for (const element of shareModalBackgroundElements()) element.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function sharePanelFocusableElements() {
  return Array.from(
    sharePanel.querySelectorAll(
      'button:not([disabled]):not([hidden]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
    )
  ).filter((element) => element.getClientRects().length > 0 || document.body.dataset.noAutoInit !== undefined);
}

function trapSharePanelFocus(event) {
  if (event.key !== "Tab" || sharePanel.hidden) return;
  const focusable = sharePanelFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    sharePanel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSharePanel(payload) {
  shareReturnFocus = document.activeElement;
  sharePayload = payload;
  shareText.value = payload.text;
  setShareCardStatus("");
  shareOverlay.hidden = false;
  sharePanel.hidden = false;
  setShareModalBackgroundInert(true);
  renderShareRatioToggle();
  renderShareBackgroundControls();
  renderShareTemplates();
  drawSharePanelCard();
  // パネルを開いている間は、後ろの共有ボタンを押せないようにする
  updateShareButton();
  shareCloseBtn.focus();
}

function closeSharePanel() {
  if (sharePanel.hidden) return;
  shareOverlay.hidden = true;
  sharePanel.hidden = true;
  setShareModalBackgroundInert(false);
  sharePayload = null;
  setShareCardStatus("");
  updateShareButton();
  if (shareReturnFocus && typeof shareReturnFocus.focus === "function") {
    shareReturnFocus.focus();
  }
  shareReturnFocus = null;
}

function setShareRatio(ratio) {
  if (!SHARE_RATIOS[ratio] || ratio === shareRatio) return;
  shareRatio = ratio;
  renderShareRatioToggle();
  drawSharePanelCard();
}

function renderShareBackgroundControls() {
  const active = Boolean(shareBackground);
  const percent = Math.round(shareBackgroundTransform.scale * 100);
  shareScaleInput.disabled = !active;
  shareScaleInput.value = String(percent);
  shareScaleValue.textContent = `${percent}%`;
  shareCanvas.classList.toggle("adjustable", active);
  shareCanvas.setAttribute("aria-disabled", String(!active));
  shareCanvas.tabIndex = active ? 0 : -1;
}

function setShareBackgroundScale(percent) {
  if (!shareBackground) return;
  const next = Math.max(100, Math.min(300, Number(percent) || 100)) / 100;
  if (next === shareBackgroundTransform.scale) return;
  shareBackgroundTransform.scale = next;
  renderShareBackgroundControls();
  drawSharePanelCard();
}

function moveShareBackground(deltaX, deltaY) {
  if (!shareBackground) return;
  shareBackgroundTransform.x = Math.max(-1, Math.min(1, shareBackgroundTransform.x + deltaX));
  shareBackgroundTransform.y = Math.max(-1, Math.min(1, shareBackgroundTransform.y + deltaY));
  drawSharePanelCard();
}

function renderShareRatioToggle() {
  shareRatioToggle.querySelectorAll(".segmented-btn").forEach((btn) => {
    const on = btn.dataset.ratio === shareRatio;
    btn.classList.toggle("current", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function drawSharePanelCard() {
  if (!sharePayload) return;
  const { width, height } = SHARE_RATIOS[shareRatio];
  // canvasは大きさを変えると中身が消えるので、変わったときだけ入れ替える
  if (shareCanvas.width !== width || shareCanvas.height !== height) {
    shareCanvas.width = width;
    shareCanvas.height = height;
  }
  const ctx = shareCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  drawShareCard(
    ctx,
    sharePayload.card,
    shareBackground,
    currentShareTemplate(),
    shareBackgroundTransform
  );
}

function setShareBackground(image, name) {
  if (shareBackground && shareBackground !== image && typeof shareBackground.close === "function") {
    shareBackground.close();
  }
  shareBackground = image;
  shareBackgroundTransform = { scale: 1, x: 0, y: 0 };
  shareBgName.textContent = image ? name : "未選択（テンプレートを使います）";
  shareBgClearBtn.hidden = !image;
  renderShareBackgroundControls();
  renderShareTemplates();
  drawSharePanelCard();
}

// ---- 背景のテンプレート ------------------------------------------------
//
// 色と模様を別々に選び、その組み合わせが背景になる。どちらも必ず1つ選ばれて
// いる状態にする(「選択なし」を作ると、下地の見た目がもう1種類増えるだけ)。

let shareColor = DEFAULT_SHARE_COLOR;
let sharePattern = DEFAULT_SHARE_PATTERN;

function currentShareTemplate() {
  return shareTemplate(shareColor, sharePattern);
}

function setShareColor(id) {
  if (!shareColorById(id) || id === shareColor) return;
  shareColor = id;
  renderShareTemplates();
  drawSharePanelCard();
}

function setSharePattern(id) {
  if (!sharePatternById(id) || id === sharePattern) return;
  sharePattern = id;
  renderShareTemplates();
  drawSharePanelCard();
}

// 見本は実際の描画関数で小さく描く。見本だけ別に持つと、実物と食い違っても
// 気付けない。ただし**間隔だけは詰める**(実寸と同じ間隔だと模様が1つ2つしか
// 入らず、何の模様なのか見て分からない)。
// 色の見本には選んでいる模様を、模様の見本には選んでいる色を乗せる。
// 組み合わせた結果がそのまま見えるので、選ぶ前に確かめられる
function renderShareTemplateRow(container, items, selectedId, buildTemplate) {
  container.textContent = "";
  for (const item of items) {
    const template = buildTemplate(item);
    const button = el("button", "share-template");
    button.type = "button";
    button.dataset.templateId = item.id;
    button.title = template.label;
    button.setAttribute("aria-label", template.label);
    button.setAttribute("aria-pressed", String(item.id === selectedId));
    if (item.id === selectedId) button.classList.add("current");

    const preview = document.createElement("canvas");
    preview.width = 96;
    preview.height = 54;
    template.draw(preview.getContext("2d"), preview.width, preview.height, SHARE_PREVIEW_STEP);
    button.appendChild(preview);
    container.appendChild(button);
  }
}

function renderShareTemplates() {
  renderShareTemplateRow(shareColors, SHARE_TEMPLATE_COLORS, shareColor, (color) =>
    shareTemplate(color.id, sharePattern)
  );
  renderShareTemplateRow(sharePatterns, SHARE_TEMPLATE_PATTERNS, sharePattern, (pattern) =>
    shareTemplate(shareColor, pattern.id)
  );
  // 画像を選んでいる間はテンプレートが効かないので、そのことを見た目でも示す
  for (const row of [shareColors, sharePatterns]) {
    row.classList.toggle("disabled", Boolean(shareBackground));
  }
}

// 状態表示は用が済んだら消す。前回の「保存しました」が残っていると、
// いま押した操作の結果と見分けが付かない
let shareCardStatusTimer = null;
const SHARE_STATUS_MS = 5000;

function setShareCardStatus(text) {
  shareCardStatus.textContent = text;
  clearTimeout(shareCardStatusTimer);
  if (text) {
    shareCardStatusTimer = setTimeout(() => {
      shareCardStatus.textContent = "";
    }, SHARE_STATUS_MS);
  }
}

// 押し直してもらうボタンの文言。パネルが開いていればパネル側のボタン、
// 閉じていればフッターのボタンを指す
function shareRetryLabel() {
  return sharePanel.hidden ? shareBtn.textContent : shareOpenBtn.textContent;
}

function shareCardFileName() {
  return `${sharePayload ? sharePayload.name : "share"}.png`;
}
