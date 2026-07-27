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

const VIEW_NAMES = ["report", "export", "backup"];
const DEFAULT_VIEW = "report";
// 見出しの右に添える画面名。既定の画面では何も足さない
const VIEW_TITLES = { report: "", export: "データ出力", backup: "データの引っ越し" };

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
  updatePlannedCount();
  renderClearArea();
  renderExportArea();
  renderBackupArea();
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

  // お支払金額と商品合計が食い違う注文。送料やクーポンが入るとここに出るので、
  // 合計を商品側から出してよいかどうかの判断材料になる
  const gaps = results.filter((r) => {
    const gap = amountGapOf(r);
    return gap !== null && gap !== 0;
  });
  exportGap.hidden = gaps.length === 0;
  exportGap.classList.toggle("warn", gaps.length > 0);
  if (gaps.length > 0) {
    exportGap.textContent =
      `お支払金額と商品合計が一致しない注文が${gaps.length}件あります。` +
      "CSVの「差額」列で内容を確認できます(送料・クーポンなどが考えられます)。";
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
  // 今年分に未収集があるなら、押したあとに収集してから共有できる
  shareBtn.disabled = valid.length === 0 && shareStats.yearPendingCount === 0;
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
      const cell = amountCell(r.amount, giftAmount(r));
      // 金額は読めたが商品明細を読めなかった注文。次の実行で拾い直す対象になっており、
      // 月別表では未収集として数えているので、内訳でも黙って収集済みには見せない
      if (!Array.isArray(r.items)) {
        cell.insertBefore(el("span", "amount-pending", "明細なし"), cell.firstChild);
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
      ? ["", `積み重ねてみると、${comparison}が買えるくらいの金額になりました。`]
      : []),
    "",
    SHARE_HASHTAG,
  ].join("\n");
}
