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
const firstRunGuide = document.getElementById("firstRunGuide");
const monthlyTrendAxis = document.getElementById("monthlyTrendAxis");
const pendingBannerClose = document.getElementById("pendingBannerClose");
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmPanel = document.getElementById("confirmPanel");
const confirmMessage = document.getElementById("confirmMessage");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
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
    const on = link.dataset.view === current;
    link.classList.toggle("current", on);
    // 水平タブでは色と下線しか手掛かりが無いので、読み上げにも現在地を出す
    if (on) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
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
// 閉じた案内の内容。件数や理由が変われば「別の案内」として出し直す。
// ストレージへは書かない(タブを開き直せばまた出る)
let dismissedPendingSignature = null;

function pendingBannerSignature(pending, incomplete) {
  return `${pending}/${incomplete ? 1 : 0}`;
}

function renderPendingBanner(current) {
  if (current === DEFAULT_VIEW) {
    pendingBanner.hidden = true;
    return;
  }
  const pending = buildResults().filter((r) => needsCollect(state.cache[r.id])).length;
  const incomplete = Boolean(state.index) && !indexIsComplete(state.index);
  const signature = pendingBannerSignature(pending, incomplete);
  // 閉じたときと内容が変わったら、閉じた記録ごと捨てて出し直す。
  // 記録を残すと、いったん収集して戻ったときにまた黙ってしまう
  if (dismissedPendingSignature !== null && dismissedPendingSignature !== signature) {
    dismissedPendingSignature = null;
  }
  pendingBanner.hidden =
    (pending === 0 && !incomplete) || dismissedPendingSignature === signature;
  if (pendingBanner.hidden) return;

  const reasons = [];
  if (pending > 0) reasons.push(`未収集の注文が${pending}件あります`);
  // 索引が途中までだと、そもそも一覧に出ていない注文が残っている
  if (incomplete) reasons.push("注文履歴の取得が途中で終わっています");
  pendingBannerText.textContent =
    `${reasons.join("。")}。この画面の内容は実際より少なくなります。`;
}

// 断り書きそのものは消さない。いま出ている件数のままの間だけ畳む
function dismissPendingBanner() {
  const pending = buildResults().filter((r) => needsCollect(state.cache[r.id])).length;
  const incomplete = Boolean(state.index) && !indexIsComplete(state.index);
  dismissedPendingSignature = pendingBannerSignature(pending, incomplete);
  pendingBanner.hidden = true;
}

// ---- ナビゲーションの形 ------------------------------------------------
//
// 広い画面ではドロワーに畳まず、ヘッダー直下の水平タブとして常時見せる。
// 畳んだままだとランキング・まとめ・支出推移の存在に気付けないため。
// 境目は760px。既存の狭幅レイアウト切り替えは620pxだが、6項目のタブは
// 620px幅では1行に収まらず折り返してしまう(1項目あたり約110〜130px必要)。
// 620〜760pxは従来どおりドロワーにし、620px以下の詰めたレイアウトとも矛盾させない。
const WIDE_NAV_MIN_WIDTH = 760;
let navIsWide = false;
// 狭い画面での引き出しの開閉。幅が変わっても、狭いままなら開けたものは開けておく
let drawerOpen = false;

// 画面幅ごとの切り替え。DOMは1組のまま、見せ方と開閉の扱いだけを変える
function applyNavLayout(wide) {
  navIsWide = wide;
  document.body.classList.toggle("nav-wide", wide);
  navDrawer.classList.toggle("nav-tabs", wide);
  // 常時出ている状態では開閉ボタンに意味が無い
  menuBtn.hidden = wide;
  menuBtn.setAttribute("aria-expanded", String(!wide && drawerOpen));
  navOverlay.hidden = wide || !drawerOpen;
  navDrawer.hidden = !wide && !drawerOpen;
}

function setDrawerOpen(open, returnFocus = true) {
  // 水平タブのときは畳まない(閉じると行き先が消えてしまう)
  if (navIsWide) return;
  drawerOpen = open;
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
  return !navIsWide && !navDrawer.hidden;
}

// ---- 確認ダイアログ ----------------------------------------------------
//
// 取り消せない操作の前に出す確認。ネイティブの confirm() は見た目も作法も
// 作者情報・共有カードのモーダルと揃わないので、同じ形で作る。
// 呼び出し側が confirm() と同じように書けるよう Promise<boolean> を返す
// (true=実行してよい / false=やめる)。

let confirmResolve = null;
let confirmReturnFocus = null;

function confirmModalBackgroundElements() {
  return Array.from(document.body.children).filter(
    (element) =>
      element !== confirmOverlay && element !== confirmPanel && element.tagName !== "SCRIPT"
  );
}

function setConfirmModalBackgroundInert(inert) {
  for (const element of confirmModalBackgroundElements()) element.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function confirmPanelFocusableElements() {
  return Array.from(confirmPanel.querySelectorAll("button:not([disabled])")).filter(
    (element) =>
      element.getClientRects().length > 0 || document.body.dataset.noAutoInit !== undefined
  );
}

function trapConfirmPanelFocus(event) {
  if (event.key !== "Tab" || confirmPanel.hidden) return;
  const focusable = confirmPanelFocusableElements();
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

function askConfirm(message, okLabel = "実行する") {
  // 二重に開くと、先の確認の答えが宙に浮く。開いている間は取消として閉じる
  if (!confirmPanel.hidden) closeConfirmDialog(false);
  confirmReturnFocus = document.activeElement;
  confirmMessage.textContent = message;
  confirmOkBtn.textContent = okLabel;
  confirmOverlay.hidden = false;
  confirmPanel.hidden = false;
  setConfirmModalBackgroundInert(true);
  // 既定の位置は「やめる」側。Enterの連打で消してしまわないようにする
  confirmCancelBtn.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirmDialog(result) {
  if (confirmPanel.hidden) return;
  confirmOverlay.hidden = true;
  confirmPanel.hidden = true;
  setConfirmModalBackgroundInert(false);
  if (confirmReturnFocus && typeof confirmReturnFocus.focus === "function") {
    confirmReturnFocus.focus();
  }
  confirmReturnFocus = null;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(result);
}

// 作者情報ダイアログの表示は dashboard-author-view.js に分離。

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
  renderFirstRunGuide();
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

// 何も取得していない初回だけ、始め方を3段階で示す。索引かキャッシュが
// 1件でもあれば、合計や収集状況の方が知りたいものなので引っ込める
function renderFirstRunGuide() {
  const started = Boolean(state.index) || Object.keys(state.cache).length > 0;
  firstRunGuide.hidden = started;
}

// ランキング・まとめ・支出推移の表示は dashboard-insights-view.js に分離。

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
      const row = statRow(year, { className: "year-row", toggle: true, expanded, pick: true });
      // 年をクリックしたときに設定する範囲(その年に存在する月の最古〜最新)
      row.dataset.rangeFrom = year.months[year.months.length - 1].key;
      row.dataset.rangeTo = year.months[0].key;
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${year.label}を収集範囲に設定`);
      return row;
    },
    (month, year) => {
      if (year.key === null) return null;
      const row = statRow(month, { className: "month-row", indent: true, pick: true });
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

// 月別テーブルの1行(年・月・日付不明で共通)。
// 行をクリックすると収集範囲になる行には、右端に「選択」の印を添える。
// 範囲に入っている行の背景色(.in-range)だけだと、押せば範囲を変えられることに
// 気付きにくいため。印そのものは飾りなので、押す対象は今までどおり行のまま
function statRow(stat, { className, toggle, expanded, indent, pick }) {
  const tr = el("tr", className);
  if (stat.pending > 0) tr.classList.add("has-pending");
  tr.appendChild(
    toggle ? toggleCell(stat.label, expanded) : td(stat.label, indent ? "indent" : null)
  );
  tr.appendChild(td(stat.count, "num"));
  tr.appendChild(td(stat.collected, "num"));
  tr.appendChild(td(stat.pending > 0 ? stat.pending : "—", "num"));
  const pickCell = td("", "pick");
  if (pick) {
    const mark = el("span", "range-pick", "選択");
    mark.setAttribute("aria-hidden", "true");
    pickCell.appendChild(mark);
  }
  tr.appendChild(pickCell);
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
  const seconds = Math.max(1, Math.ceil((count * REQUEST_INTERVAL_AVERAGE_MS) / 1000));
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

// 共有ボタンと共有カードの表示は dashboard-share-view.js に分離。
