"use strict";

// 集計ページの中枢。状態を持ち、イベントを受け取り、BOOTHから取得する。
// ページの読み取りは dashboard-parse.js、画面への反映は dashboard-*-view.js。
// これらは classic script として同じグローバルを共有する(モジュールではない)。

const ORDERS_INDEX_URL = "https://accounts.booth.pm/orders";
const ORDER_DETAIL_URL = "https://accounts.booth.pm/orders/";
const REQUEST_INTERVAL_MIN_MS = 250;
const REQUEST_INTERVAL_MAX_MS = 350;
const REQUEST_INTERVAL_AVERAGE_MS =
  (REQUEST_INTERVAL_MIN_MS + REQUEST_INTERVAL_MAX_MS) / 2;
const CACHE_FLUSH_EVERY = 5; // 取得途中で中断されても失わないよう小まめに保存する
const RUN_STATE_INTERVAL_MS = 400; // ポップアップへ進捗を渡す書き込みの間引き
const RUN_LOCK_HEARTBEAT_MS = 10_000;
const RUN_LOCK_WEB_NAME = "booth-purchase-total-collector";
const EXCLUDED_STATUSES = new Set(["cancelled"]);
const RUN_LOCK_OWNER_ID =
  globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

let running = false;
let abortController = null;
let lastRunStateWrite = 0;
let runLockHeartbeatTimer = null;
const state = { index: null, cache: {} };

// ---- イベント配線 ------------------------------------------------------

// 画面の切り替え。移動しても同じJSコンテキストのままなので、収集は止まらない。
// 広い画面ではヘッダー直下の水平タブ、狭い画面では従来の引き出しにする
const wideNavMedia = window.matchMedia(`(min-width: ${WIDE_NAV_MIN_WIDTH}px)`);
applyNavLayout(wideNavMedia.matches);
wideNavMedia.addEventListener("change", (event) => applyNavLayout(event.matches));
// 拡張のページは幅の変わり方が環境によって違い、メディアクエリの change が
// 届かないことがある。窓の大きさが変わったときにも合わせ直す(同じ形なら何も変わらない)
window.addEventListener("resize", () => applyNavLayout(wideNavMedia.matches));

menuBtn.addEventListener("click", () => setDrawerOpen(!drawerIsOpen()));
navOverlay.addEventListener("click", () => setDrawerOpen(false));
navDrawer.addEventListener("click", (event) => {
  // リンクの既定動作でハッシュが変わり、hashchange 側で描画が切り替わる
  if (event.target.closest(".nav-link[data-view]")) setDrawerOpen(false);
});
// 未収集の案内は、件数が変わらない間だけ畳める(断り書き自体は消さない)
pendingBannerClose.addEventListener("click", dismissPendingBanner);

// 確認ダイアログ。作者情報・共有カードと同じ作法(背景inert・Escape・フォーカストラップ)
confirmOkBtn.addEventListener("click", () => closeConfirmDialog(true));
confirmCancelBtn.addEventListener("click", () => closeConfirmDialog(false));
confirmOverlay.addEventListener("click", () => closeConfirmDialog(false));
document.addEventListener("keydown", (event) => {
  if (confirmPanel.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeConfirmDialog(false);
    return;
  }
  trapConfirmPanelFocus(event);
});

authorBtn.addEventListener("click", openAuthorPanel);
authorCloseBtn.addEventListener("click", closeAuthorPanel);
authorOverlay.addEventListener("click", closeAuthorPanel);
authorPortrait.addEventListener("error", () => {
  authorPortrait.src = "icons/icon128.png";
}, { once: true });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawerIsOpen()) setDrawerOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (authorPanel.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeAuthorPanel();
    return;
  }
  trapAuthorPanelFocus(event);
});
window.addEventListener("hashchange", () => {
  renderCurrentView();
  // 別の画面へ移ったあとに前の共有の結果が残っていると、今の画面の話に見える
  setShareCardStatus("");
  window.scrollTo(0, 0);
});

// 保存データの読み込みを待たずに画面を決める。待つと、#/export で開き直したときに
// 一瞬だけレポート画面が見えてしまう
renderCurrentView();

exportOrdersBtn.addEventListener("click", () =>
  downloadCsv(buildOrdersCsv(buildResults()), csvFileName("orders"))
);

exportItemsBtn.addEventListener("click", () =>
  downloadCsv(buildItemsCsv(buildResults()), csvFileName("items"))
);

backupSaveBtn.addEventListener("click", () =>
  downloadFile(
    JSON.stringify(buildBackup(state.index, state.cache), null, 1),
    backupFileName(),
    "application/json"
  )
);

// 読み込みは、形を確かめてから今のデータと併合する。入れ替えにすると、
// 古いバックアップを読んだときに今あるものを失う
restoreFile.addEventListener("change", async () => {
  const file = restoreFile.files && restoreFile.files[0];
  if (!file) return;
  if (running) {
    restoreStatus.classList.add("warn");
    restoreStatus.textContent = "収集の実行中は復元できません。終わってからもう一度選択してください。";
    restoreFile.value = "";
    return;
  }
  restoreStatus.classList.remove("warn");
  restoreStatus.textContent = "読み込んでいます...";

  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (err) {
    parsed = { ok: false, message: "ファイルを開けませんでした。" };
  }
  if (!parsed.ok) {
    restoreStatus.classList.add("warn");
    restoreStatus.textContent = parsed.message;
    restoreFile.value = "";
    return;
  }

  const merged = mergeBackup(state, parsed);
  state.index = merged.index;
  state.cache = merged.cache;
  if (state.index) await saveIndex(state.index);
  await saveCache(state.cache);
  await saveSummary(buildSummary(false));
  render();

  restoreStatus.textContent =
    `復元しました。注文が${merged.addedOrders}件、収集済みの金額が${merged.addedAmounts}件増えました` +
    (parsed.exportedAt ? `(バックアップ日時: ${formatTimestamp(parsed.exportedAt)})` : "") +
    "。";
  restoreFile.value = "";
});

// 拡張の権限を増やさずに保存させるため、Blobへのリンクを自分で作って押す
// ("downloads" 権限を足すと、権限は storage とBOOTHのドメインだけ、という現状が崩れる)
function downloadCsv(text, fileName) {
  return downloadFile(text, fileName, "text/csv;charset=utf-8");
}

function downloadFile(text, fileName, type) {
  downloadBlob(new Blob([text], { type }), fileName);
}

// downloads 権限を足さずに保存する。権限は storage と BOOTH のドメインだけに保つ
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 押した直後に取り消すと保存が始まらないことがあるので、少し置いてから解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

fetchIndexBtn.addEventListener("click", () =>
  runTask((signal) => fetchIndexTask(signal, forceRefreshIndex.checked))
);

collectRangeBtn.addEventListener("click", () =>
  runTask((signal) => collectRangeTask(signal))
);

runAllBtn.addEventListener("click", () => runTask(runAllTask));

forceRefreshRange.addEventListener("change", updatePlannedCount);
forceRefreshAll.addEventListener("change", updatePlannedCount);
rangeFrom.addEventListener("change", onRangeChanged);
rangeTo.addEventListener("change", onRangeChanged);
orderSearch.addEventListener("input", () => renderOrderTable(buildResults()));
orderStatusFilter.addEventListener("change", () => renderOrderTable(buildResults()));
orderSort.addEventListener("change", () => renderOrderTable(buildResults()));

function onRangeChanged() {
  highlightSelectedRange();
  updatePlannedCount();
}

// 投稿画面を開くだけで、投稿そのものはユーザーがXの画面で行う。
// 未収集が残ったまま「合計」を名乗ると実際より少ない額が外に出てしまうため、
// その場合は今年分だけを収集し、今年の金額だけを共有する
shareBtn.addEventListener("click", async () => {
  if (running) return;
  if (shareMode() === "ranking") {
    await shareRanking();
    return;
  }
  if (shareMode() === "summary") {
    await shareYearSummary();
    return;
  }
  if (!shareStats) return;

  if (!canShareTotal(shareStats)) {
    if (!(await askConfirm(shareConfirmMessage(shareStats), "共有する"))) return;
    if (shareStats.yearPendingCount > 0) {
      const { aborted, failed } = await runTask((signal) =>
        collectAmounts(ordersInYear(shareStats.year), false, signal)
      );
      // 中断や失敗のあとに開くと、案内した内容と違う額を共有することになる
      if (aborted || failed) return;
    }
    if (shareStats.yearCount === 0) {
      showNotice("今年の注文が無いため、共有できる金額がありません。");
      return;
    }
    // 取得しきれなかった場合は、共有はするが黙っては出さない
    if (shareStats.yearPendingCount > 0) {
      addNotice(
        `今年分のうち${shareStats.yearPendingCount}件を取得できなかったため、共有する金額は実際より少なくなります。`
      );
    }
  }
  openSharePanel({
    name: "booth-share",
    text: buildShareText(shareStats),
    card: buildTotalShareCard(shareStats),
  });
});

// ランキングは全期間が対象なので、合計のように「今年の分だけ」へ逃がせない。
// 順位がずれうるときは、そのまま出すかどうかを本人に決めてもらう
async function shareRanking() {
  if (!rankingShareStats || rankingShareStats.rows.length === 0) return;
  if (rankingShareIssues(rankingShareStats).length > 0) {
    if (!(await askConfirm(rankingShareConfirmMessage(rankingShareStats), "共有する"))) return;
  }
  const hide = rankingHideNumbers.checked;
  openSharePanel({
    name: "booth-ranking",
    text: buildRankingShareText(rankingShareStats, hide),
    card: buildRankingShareCard(rankingShareStats, hide),
  });
}

// まとめもランキングと同じで、期間を切り出しても数字は正しくならない
async function shareYearSummary() {
  if (!summaryShareStats || summaryShareStats.orderCount === 0) return;
  if (summaryShareIssues(summaryShareStats).length > 0) {
    if (!(await askConfirm(summaryShareConfirmMessage(summaryShareStats), "共有する"))) return;
  }
  openSharePanel({
    name: `booth-${summaryShareStats.year}`,
    text: buildSummaryShareText(summaryShareStats),
    card: buildSummaryShareCard(summaryShareStats),
  });
}

// ---- 共有カードのパネル ------------------------------------------------

shareCloseBtn.addEventListener("click", closeSharePanel);
shareOverlay.addEventListener("click", closeSharePanel);
document.addEventListener("keydown", (event) => {
  if (sharePanel.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSharePanel();
    return;
  }
  trapSharePanelFocus(event);
});

// 画像の縦横比。投稿先に合わせて選べるようにする
shareRatioToggle.addEventListener("click", (event) => {
  const btn = event.target.closest(".segmented-btn");
  if (btn) setShareRatio(btn.dataset.ratio);
});

shareScaleInput.addEventListener("input", () => setShareBackgroundScale(shareScaleInput.value));

let shareDragPointer = null;
let shareDragX = 0;
let shareDragY = 0;

shareCanvas.addEventListener("pointerdown", (event) => {
  if (!shareBackground) return;
  event.preventDefault();
  shareDragPointer = event.pointerId;
  shareDragX = event.clientX;
  shareDragY = event.clientY;
  shareCanvas.classList.add("dragging");
  if (shareCanvas.setPointerCapture) shareCanvas.setPointerCapture(event.pointerId);
});

shareCanvas.addEventListener("pointermove", (event) => {
  if (shareDragPointer !== event.pointerId) return;
  const width = Math.max(1, shareCanvas.clientWidth);
  const height = Math.max(1, shareCanvas.clientHeight);
  moveShareBackground(
    ((event.clientX - shareDragX) / width) * 2,
    ((event.clientY - shareDragY) / height) * 2
  );
  shareDragX = event.clientX;
  shareDragY = event.clientY;
});

function stopShareBackgroundDrag(event) {
  if (shareDragPointer !== event.pointerId) return;
  shareDragPointer = null;
  shareCanvas.classList.remove("dragging");
}

shareCanvas.addEventListener("pointerup", stopShareBackgroundDrag);
shareCanvas.addEventListener("pointercancel", stopShareBackgroundDrag);
shareCanvas.addEventListener("lostpointercapture", stopShareBackgroundDrag);
shareCanvas.addEventListener("keydown", (event) => {
  if (!shareBackground || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.15 : 0.04;
  if (event.key === "ArrowLeft") moveShareBackground(-step, 0);
  if (event.key === "ArrowRight") moveShareBackground(step, 0);
  if (event.key === "ArrowUp") moveShareBackground(0, -step);
  if (event.key === "ArrowDown") moveShareBackground(0, step);
});

// 選んだ画像はこのタブの中だけで使う。ストレージへ入れると、
// 画像1枚で保存できる注文データを圧迫しかねない
async function applyShareBackgroundFile(file) {
  if (!file) return;
  try {
    setShareBackground(await createImageBitmap(file), file.name);
    setShareCardStatus("背景を適用しました。");
  } catch {
    // 拡張子だけ画像で中身が違うファイルもある。黙って既定の背景に戻さない
    setShareCardStatus("この画像は読み込めませんでした。別の画像を選んでください。");
  }
}

shareBgFile.addEventListener("change", async () => {
  await applyShareBackgroundFile(shareBgFile.files && shareBgFile.files[0]);
  // 同じファイルを選び直したときも change が起きるようにする
  shareBgFile.value = "";
});

// 投げ込みでも同じことができるようにする。ページ全体で既定の動作を止めないと、
// 枠の外へ落としたときにブラウザが画像を開いてしまい、作りかけの共有が消える
for (const type of ["dragover", "drop"]) {
  window.addEventListener(type, (event) => event.preventDefault());
}

shareDropZone.addEventListener("dragover", () => shareDropZone.classList.add("over"));
shareDropZone.addEventListener("dragleave", () => shareDropZone.classList.remove("over"));
shareDropZone.addEventListener("drop", async (event) => {
  shareDropZone.classList.remove("over");
  const file = event.dataTransfer && event.dataTransfer.files[0];
  if (!file) {
    // 画像そのものではなくWebページ上の画像を投げると、ファイルが付いてこない
    setShareCardStatus("画像ファイルを投げ込んでください。");
    return;
  }
  await applyShareBackgroundFile(file);
});

// テンプレートの選択。色と模様を別々に選び、その組み合わせが背景になる
function bindShareTemplateRow(row, apply) {
  row.addEventListener("click", (event) => {
    const button = event.target.closest(".share-template");
    if (!button) return;
    if (shareBackground) {
      setShareCardStatus("画像を選んでいる間はテンプレートを使えません。「元に戻す」を押してください。");
      return;
    }
    apply(button.dataset.templateId);
  });
}

bindShareTemplateRow(shareColors, setShareColor);
bindShareTemplateRow(sharePatterns, setSharePattern);

shareBgClearBtn.addEventListener("click", () => {
  setShareBackground(null, "");
  setShareCardStatus("既定の背景に戻しました。");
});

function shareCardBlob() {
  return new Promise((resolve) => shareCanvas.toBlob(resolve, "image/png"));
}

shareSaveBtn.addEventListener("click", async () => {
  const blob = await shareCardBlob();
  if (!blob) {
    setShareCardStatus("画像を作れませんでした。");
    return;
  }
  downloadBlob(blob, shareCardFileName());
  setShareCardStatus("画像を保存しました。投稿画面へ貼り付けてください。");
});

shareCopyBtn.addEventListener("click", async () => {
  const blob = await shareCardBlob();
  if (!blob) {
    setShareCardStatus("画像を作れませんでした。");
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setShareCardStatus("画像をコピーしました。投稿画面で貼り付けてください。");
  } catch {
    // クリップボードは権限やブラウザの対応で失敗する。保存なら必ずできる
    setShareCardStatus("コピーできませんでした。「画像を保存」を使ってください。");
  }
});

shareOpenBtn.addEventListener("click", () => {
  if (!sharePayload) return;
  openShareWindow(sharePayload.text);
});

// まとめる年の切り替え
summaryYear.addEventListener("change", () => setSummaryYear(summaryYear.value));

// 買った時間帯の対象期間
for (const select of [heatmapFrom, heatmapTo]) {
  select.addEventListener("change", () => setHeatmapRange(heatmapFrom.value, heatmapTo.value));
}
heatmapAllBtn.addEventListener("click", () => setHeatmapRange(null, null));

// 比較する2つの年の切り替え
trendYear.addEventListener("change", () => setTrendYears(trendYear.value, trendBaseYear.value));
trendBaseYear.addEventListener("change", () =>
  setTrendYears(trendYear.value, trendBaseYear.value)
);

// 順位や行のどこを押しても、そのショップで買った商品を開く。
// 順位横の ▸ だけが対象だと小さすぎて開けることに気付けないため、行全体を効かせる。
// ただしショップ名のリンクは本来の遷移(ショップページ)を優先する。
// 明細を見るつもりで踏んだ人が別ページへ飛ばされる方が困る
for (const tbody of [rankingTableBody, summaryTopShopsBody]) {
  tbody.addEventListener("click", (event) => {
    const button = event.target.closest("button.rank-toggle");
    if (button) {
      toggleShopItems(button.closest("tr.shop-row").dataset.shopKey);
      return;
    }
    if (event.target.closest("a")) return;
    const row = event.target.closest("tr.shop-row");
    if (row) toggleShopItems(row.dataset.shopKey);
  });
}

// 金額編と購入数編の切り替え
rankingSortToggle.addEventListener("click", (event) => {
  const btn = event.target.closest(".segmented-btn");
  if (btn) setRankingSort(btn.dataset.sort);
});

function openShareWindow(text) {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", text);
  // 第3引数に noopener を渡すと、タブが開けても戻り値は必ず null になる(仕様)。
  // それを「止められた」と読んでいたため、正常に開いているのに毎回
  // 押し直しを案内していた。開いてから opener を切れば、戻り値が
  // 本当に止められたかどうかを表すようになる
  const opened = window.open(url.toString(), "_blank");
  if (!opened) {
    // 収集を挟むとクリックから時間が空くため、ブラウザに止められることがある。
    // 収集は済んでいるので、押し直せば今度はその場で開ける。
    // 押す先のボタンは開いている画面で文言が変わるので、そのまま引用する
    addNotice(
      `ブラウザに新しいタブを止められました。もう一度「${shareRetryLabel()}」を押してください。`
    );
    return;
  }
  // 共有先から window.opener 経由でこのページを触らせない
  opened.opener = null;
}

// 取り直しに時間がかかるので、消す前に必ず確認する
clearIndexBtn.addEventListener("click", async () => {
  if (running) return;
  const count = state.index ? state.index.orders.length : 0;
  if (count === 0) return;
  const ok = await askConfirm(
    `注文履歴のキャッシュ(${count}件)を削除します。\n収集した金額は残ります。よろしいですか?`,
    "削除する"
  );
  if (!ok) return;
  await clearIndexData();
  showNotice(`注文履歴のキャッシュを削除しました(${count}件)。`);
});

clearAmountsBtn.addEventListener("click", async () => {
  if (running) return;
  const count = Object.keys(state.cache).length;
  if (count === 0) return;
  const ok = await askConfirm(
    `収集した金額のキャッシュ(${count}件)を削除します。\n注文履歴は残ります。よろしいですか?`,
    "削除する"
  );
  if (!ok) return;
  await clearAmountsData();
  showNotice(`収集した金額のキャッシュを削除しました(${count}件)。`);
});

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
  if (running) return;
  const yearRow = event.target.closest("tr.year-row");
  if (yearRow) {
    // ▸ は開閉、それ以外の場所はその年をまとめて範囲に設定
    if (event.target.closest(".table-toggle")) {
      toggleYearRow(monthTableBody, expandedMonthYears, yearRow);
    } else {
      setRange(yearRow.dataset.rangeFrom, yearRow.dataset.rangeTo);
    }
    return;
  }
  const monthRow = event.target.closest("tr.month-row");
  if (monthRow) setRange(monthRow.dataset.monthKey, monthRow.dataset.monthKey);
});

monthTableBody.addEventListener("keydown", (event) => {
  if (running || (event.target !== event.currentTarget && event.target.closest(".table-toggle"))) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const yearRow = event.target.closest("tr.year-row");
  const monthRow = event.target.closest("tr.month-row");
  if (!yearRow && !monthRow) return;
  event.preventDefault();
  if (yearRow) setRange(yearRow.dataset.rangeFrom, yearRow.dataset.rangeTo);
  if (monthRow) setRange(monthRow.dataset.monthKey, monthRow.dataset.monthKey);
});

// こちらは範囲指定に関わらないので、年の行のどこを押しても開閉するだけ
periodTableBody.addEventListener("click", (event) => {
  if (running) return;
  const yearRow = event.target.closest("tr.year-row");
  if (yearRow) toggleYearRow(periodTableBody, expandedPeriodYears, yearRow);
});

trendPeriodTableBody.addEventListener("click", (event) => {
  if (running) return;
  const yearRow = event.target.closest("tr.year-row");
  if (yearRow) {
    toggleYearRow(trendPeriodTableBody, expandedTrendPeriodYears, yearRow);
  }
});

// テストでは state を直接差し替えて描画や取得を検証するため、
// 保存データの読み込みは走らせない(非同期で state を上書きして競合するため)
if (!document.body.dataset.noAutoInit) init();

// 自分のタブID。集計タブを2枚開くとキーの登録は後勝ちになるため、閉じるときに
// 「キーが自分の登録か」を確かめる材料として init() で覚えておく
let dashboardTabId = null;

// pagehide でのキーの後始末。無条件に消すと、残っているタブが登録したキーまで
// 消してしまい、タブが残っているのにポップアップから新しいタブが開く。
// 保存値が自分のタブIDと一致するときだけ消す。
// pagehide 中は読み出し→比較→削除の非同期処理が最後まで走らないことがあるが、
// その場合はキーが残るだけで実害はない。openDashboard() が tabs.get() の失敗で
// 消えたタブのキーを検知して新しいタブへ切り替えるため、消し損ねは自然に回復する。
// 逆(他タブのキーを消してしまう誤削除)は回復手段が無いので、残す側に倒す
async function releaseDashboardTabKey() {
  if (dashboardTabId == null) return;
  const stored = await readStored(DASHBOARD_TAB_KEY, null);
  if (stored === dashboardTabId) await removeStored(DASHBOARD_TAB_KEY);
}

async function init() {
  // ポップアップから「集計ページを開く」で復帰できるよう、自分のタブIDを覚えておく
  try {
    const tab = await ext.tabs.getCurrent();
    if (tab && tab.id != null) {
      dashboardTabId = tab.id;
      await writeStored(DASHBOARD_TAB_KEY, tab.id);
    }
  } catch (e) {
    // タブIDが取れなくても集計自体には影響しない
  }
  window.addEventListener("pagehide", () => {
    releaseDashboardTabKey();
    if (running) clearRunState();
  });

  state.index = await loadIndex();
  state.cache = await loadCache();
  render();
}

// ---- 保存データの操作 --------------------------------------------------

async function clearIndexData() {
  state.index = null;
  expandedMonthYears.clear();
  expandedPeriodYears.clear();
  await removeStored(INDEX_KEY);
  render();
  await saveSummary(buildSummary(false));
}

async function clearAmountsData() {
  state.cache = {};
  await saveCache(state.cache);
  render();
  await saveSummary(buildSummary(false));
}

// ---- 状態からの導出 ----------------------------------------------------

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

// 索引に入っている最も古い注文(日時が読めるもののうち)
function oldestCoveredOrder() {
  if (!state.index) return null;
  let oldest = null;
  for (const order of state.index.orders) {
    const d = parseOrderDate(order.date);
    if (!d) continue;
    if (!oldest || d.sortKey < parseOrderDate(oldest.date).sortKey) oldest = order;
  }
  return oldest;
}

// 索引と収集済みの金額を突き合わせて表示用の一覧にする
// amount: 数値=収集済み / null=取得失敗 / undefined=未収集
// items: 配列=商品明細あり / null=明細を読めていない
function buildResults() {
  if (state.index) {
    return targetOrders().map((o) => {
      const entry = state.cache[o.id];
      return {
        id: o.id,
        date: o.date,
        status: o.status,
        amount: entry ? entry.amount : undefined,
        // 未収集の注文を0円のギフトとして書き出さないよう、そのままの値を持たせる
        // (表示側は giftAmount() を通すので、数値でなければ0として扱われる)
        gift: entry ? entry.gift : undefined,
        items: hasItems(entry) ? entry.items : null,
        shipping: entry ? entry.shipping : undefined,
        // 何を保存した注文なのかを画面側でも判断できるようにする
        v: entry ? entry.v : undefined,
      };
    });
  }
  // 索引が無い場合はキャッシュだけで表示する
  return Object.entries(state.cache).map(([id, entry]) => ({
    id,
    date: entry.date,
    status: entry.status,
    amount: entry.amount,
    gift: entry.gift,
    items: hasItems(entry) ? entry.items : null,
    shipping: entry.shipping,
    v: entry.v,
  }));
}

// ポップアップに見せる要約
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

// ---- 実行の共通処理 ----------------------------------------------------

// 呼び出し側が「やり切れたか」で分岐できるよう結果を返す
// (共有は、中断や失敗のあとに投稿画面を開かないようにするために使う)
async function runTask(task) {
  if (running) return { aborted: false, failed: true };

  const execute = () => runTaskWithLease(task);
  if (
    globalThis.navigator &&
    globalThis.navigator.locks &&
    typeof globalThis.navigator.locks.request === "function"
  ) {
    let result;
    await globalThis.navigator.locks.request(
      RUN_LOCK_WEB_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (lock) result = await execute();
      }
    );
    return result === undefined ? lockedRunResult() : result;
  }
  return execute();
}

function lockedRunResult() {
  clearError();
  showNotice(
    "別の集計ページで収集を実行中です。完了するか、期限切れになるまでお待ちください。"
  );
  return { aborted: false, failed: true, locked: true };
}

async function runTaskWithLease(task) {
  if (!(await acquireRunLock(RUN_LOCK_OWNER_ID))) return lockedRunResult();
  setRunning(true);
  clearError();
  clearNotice();
  abortController = new AbortController();
  runLockHeartbeatTimer = setInterval(async () => {
    try {
      if (!(await refreshRunLock(RUN_LOCK_OWNER_ID))) abortController?.abort();
    } catch (err) {
      abortController?.abort();
    }
  }, RUN_LOCK_HEARTBEAT_MS);
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
    try {
      await saveCache(state.cache);
    } finally {
      if (runLockHeartbeatTimer !== null) clearInterval(runLockHeartbeatTimer);
      runLockHeartbeatTimer = null;
      await Promise.allSettled([
        clearRunState(RUN_LOCK_OWNER_ID),
        releaseRunLock(RUN_LOCK_OWNER_ID),
      ]);
      abortController = null;
      setRunning(false);
    }
  }

  render();
  await saveSummary(buildSummary(aborted));

  if (aborted) {
    // 一括集計で①まで終わっている場合は、その結果も残したいので書き足す
    addNotice(
      "中断しました。ここまでに取得した金額は保存されているため、再実行すると続きから取得します。"
    );
  }
  return { aborted, failed };
}

function setRunning(isRunning) {
  running = isRunning;
  renderRunningState(isRunning);
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

function requestIntervalMs(random = Math.random) {
  return Math.floor(
    REQUEST_INTERVAL_MIN_MS + random() * (REQUEST_INTERVAL_MAX_MS - REQUEST_INTERVAL_MIN_MS + 1)
  );
}

// ポップアップ側で進捗を表示できるようにストレージへ書き出す(書き込み過多を避けて間引く)
async function publishRunState(runState, force) {
  const now = Date.now();
  if (!force && now - lastRunStateWrite < RUN_STATE_INTERVAL_MS) return;
  lastRunStateWrite = now;
  await saveRunState({ ...runState, ownerId: RUN_LOCK_OWNER_ID });
}

// ---- 取得処理 ----------------------------------------------------------

// ログイン切れは何度試しても直らず、以降の取得もすべて失敗するので、
// 再試行や読み飛ばしの対象から外せるよう名前を付けておく
function loginRequiredError() {
  const err = new Error(
    "ログインが必要です。accounts.booth.pm にログインしてから再度実行してください。"
  );
  err.name = "LoginRequiredError";
  return err;
}

// 繰り返しても結果が変わらない失敗か、同じセッションでは以降も失敗する
// 認証・アクセス拒否かどうか。401/403で全注文を回り続けないよう、その場で止める。
function isFatalFetchError(err) {
  return (
    err.name === "AbortError" ||
    err.name === "LoginRequiredError" ||
    err.status === 401 ||
    err.status === 403
  );
}

function retryAfterMs(headers, now = Date.now()) {
  if (!headers || typeof headers.get !== "function") return null;
  const value = headers.get("Retry-After");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function httpFetchError(res, url) {
  const err = new Error(`ページの取得に失敗しました (HTTP ${res.status}): ${url}`);
  err.name = "HttpError";
  err.status = res.status;
  err.retryAfterMs = retryAfterMs(res.headers);
  return err;
}

function isRetryableFetchError(err) {
  if (isFatalFetchError(err)) return false;
  if (err instanceof TypeError || err.name === "TypeError") return true;
  return err.status === 408 || err.status === 429 || (err.status >= 500 && err.status <= 599);
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
    throw loginRequiredError();
  }
  if (!res.ok) {
    throw httpFetchError(res, url);
  }
  const html = await res.text();
  // DOMParserが生成する文書は不活性で、スクリプトは実行されず
  // 画像などのサブリソースも取得されない(検証済み)
  return new DOMParser().parseFromString(html, "text/html");
}

// 索引の意味づけを判定するだけの純関数なので indexIsComplete は common.js にある
// (backup.js から参照しており、制御層に置くと依存の向きが逆になるため)

// 一覧ページを読めていないと分かる兆候。どちらの場合も、実際は取得できていない
// 古い注文があるのに「全期間を取得済み」と表示してしまい、少ない合計を
// 正しい合計だと思わせることになるため、完全とは記録しない
function listPageLooksUnreadable({ orders, maxPage, pagerFound, emptyFound = false }) {
  // 1件も取れず、BOOTHの正式な空状態も見つからない(行のセレクタが効いていない疑い)
  if (orders.length === 0) return !emptyFound;
  // ページ送りはあるのに、ページ番号を1つも読めない(ページャのセレクタが効いていない)
  return pagerFound && maxPage === 1;
}

// 一覧は新しい順に並んでいる。以前の索引が最古まで揃っているときに限り、
// 既知の注文に当たった時点で「それより古い分も揃っている」と判断して打ち切れる。
// 揃っていないとき(前回が中断で終わったときなど)は、既知の注文より古いところに
// 取得できていない範囲が残っている可能性があるため、既知の注文は読み飛ばして
// 最後のページまで進み、抜けている分を拾う
function appendUnknown(target, rows, known, stopAtKnown) {
  for (const row of rows) {
    if (known.has(row.id)) {
      if (stopAtKnown) return true;
      continue;
    }
    target.push(row);
  }
  return false;
}

// 取得できたところまでを索引へ反映する。中断や失敗のあとでも呼ばれるため、
// 「どこまで確実に取得できたか」をここで確定させる
async function commitIndex(fetched, context) {
  const { force, reachedKnown, finishedAllPages, previousComplete } = context;
  const previousOrders = state.index ? state.index.orders : [];
  const before = new Set(previousOrders.map((o) => o.id));

  const merged = new Map();
  // 全件再取得を最後までやり切った場合だけ、古い内容を捨てて置き換える。
  // 途中で終わった場合は既存分を残さないと、以前取得した範囲まで失われる
  if (!(force && finishedAllPages)) {
    for (const order of previousOrders) merged.set(order.id, order);
  }
  // 同一注文が商品数だけ複数行として現れるため、注文IDで重複除去する
  // （これが既存拡張の「同一ショップの複数商品購入で重複カウントされる」不具合の原因）
  for (const order of fetched) merged.set(order.id, order);

  const orders = Array.from(merged.values());
  state.index = {
    updatedAt: new Date().toISOString(),
    orders,
    // 最古まで到達したか、既知の注文に接続できて以前が完全なら、全体として完全
    complete: finishedAllPages || (reachedKnown && previousComplete),
  };
  await saveIndex(state.index);
  return orders.filter((o) => !before.has(o.id)).length;
}

// 全件再取得を最後まで完了したときだけ、現在の集計対象に存在しないキャッシュを消す。
// キャンセルになった注文や履歴から消えた注文の詳細を残すと、索引だけ削除した際に
// 古いキャッシュから合計へ戻るため。増分取得や途中終了では既存データを守る。
async function pruneCacheAfterFullIndexRefresh() {
  const activeIds = new Set(targetOrders().map((order) => order.id));
  const kept = Object.fromEntries(
    Object.entries(state.cache).filter(([id]) => activeIds.has(id))
  );
  if (Object.keys(kept).length === Object.keys(state.cache).length) return;
  state.cache = kept;
  await saveCache(state.cache);
}

// ① 一覧ページを新しい順に巡回して注文の索引を作る
async function fetchIndexTask(signal, force) {
  const known = new Set(
    force || !state.index ? [] : state.index.orders.map((o) => o.id)
  );
  const previousComplete = !force && indexIsComplete(state.index);
  // 打ち切ってよいのは、以前の索引が最古まで揃っているときだけ
  const stopAtKnown = previousComplete;
  // 前回が途中で終わっている索引。既知の注文の先に抜けが残っているかもしれない
  const hadPartialIndex = !force && Boolean(state.index) && !previousComplete;

  const fetched = [];
  let reachedKnown = false;
  let finishedAllPages = false;
  let unreadable = false;
  let emptyHistory = false;
  let added = 0;

  try {
    setProgress("購入履歴の1ページ目を取得中...", 0);
    await publishRunState({ phase: "注文履歴の取得", current: 0, total: 0 }, true);

    const firstDoc = await fetchDocWithRetry(ORDERS_INDEX_URL, signal);
    const firstPage = parseListPage(firstDoc);
    const { orders: firstOrders, maxPage } = firstPage;
    emptyHistory = firstOrders.length === 0 && firstPage.emptyFound;
    unreadable = listPageLooksUnreadable(firstPage);
    reachedKnown = appendUnknown(fetched, firstOrders, known, stopAtKnown);

    for (let page = 2; page <= maxPage && !reachedKnown; page++) {
      setProgress(
        `購入履歴一覧を取得中... (${page}/${maxPage}ページ)`,
        page / maxPage
      );
      await publishRunState({
        phase: "注文履歴の取得",
        current: page,
        total: maxPage,
      });
      await sleep(requestIntervalMs(), signal);
      const doc = await fetchDocWithRetry(`${ORDERS_INDEX_URL}?page=${page}`, signal);
      const parsed = parseListPage(doc);
      // 途中のページだけログイン画面や想定外のHTMLが返ることもある。
      // 空のページを「最古まで取得できた」と扱うと、少ない合計を完全な結果として
      // 保存してしまうため、1ページ目と同じ条件で必ず検証する。
      if (listPageLooksUnreadable(parsed)) {
        unreadable = true;
        break;
      }
      reachedKnown = appendUnknown(
        fetched,
        parsed.orders,
        known,
        stopAtKnown
      );
    }
    // 例外で抜けた場合はここを通らないため、巡回しきったときだけ true になる。
    // 一覧を読めていない疑いがあるときは「最古まで辿った」と見なさない
    finishedAllPages = !reachedKnown && !unreadable;
  } finally {
    added = await commitIndex(fetched, {
      force,
      reachedKnown,
      finishedAllPages,
      previousComplete,
    });
    if (force && finishedAllPages) await pruneCacheAfterFullIndexRefresh();
  }

  if (unreadable) {
    addNotice(
      "購入履歴の一覧をうまく読み取れませんでした。ログイン状態または" +
        "ページの構造が変わっている可能性があります。" +
        "この場合すべての注文を取得できていないため、合計は実際より少なくなります。"
    );
  } else if (emptyHistory) {
    addNotice("購入履歴はありませんでした。集計する注文はありません。");
  } else if (reachedKnown) {
    addNotice(
      `取得済みの注文に到達したため、そこで停止しました(以降は読み込み済み)。新しく追加された注文: ${added}件。`
    );
  } else if (hadPartialIndex) {
    addNotice(
      `前回は途中で終わっていたため、抜けていた範囲も含めて最古まで取得しました(新しく追加された注文: ${added}件)。`
    );
  } else {
    addNotice(`注文履歴を取得しました(新しく追加された注文: ${added}件)。`);
  }
}

// 収集対象の絞り込み。forceが立っている場合は収集済みでも取り直す
function pendingTargets(orders, force) {
  return force ? orders : orders.filter((o) => needsCollect(state.cache[o.id]));
}

// 指定された月の範囲(両端を含む)に入る注文。日付が読めない注文は範囲に入れない。
// 開始と終了が入れ替えて指定されても良いようにここでそろえる
function ordersInRange(from, to) {
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  return targetOrders().filter((o) => {
    const key = monthKeyOf(o.date);
    return key !== null && key >= lo && key <= hi;
  });
}

// その年の注文(集計対象のみ)。日付を読めない注文はどの年にも入れない
function ordersInYear(year) {
  return targetOrders().filter((o) => {
    const d = parseOrderDate(o.date);
    return d !== null && d.year === year;
  });
}

// 一時的な通信エラーで数百件の収集が丸ごと止まらないよう、少しだけ粘る。
// 混雑している可能性があるので、通常の間隔より長めに待ってから試し直す。
// テストから待ち時間を詰められるよう変数にしてある
let fetchRetryCount = 2;
let fetchRetryBaseWaitMs = 2000;

function fetchRetryWaitMs(err, attempt) {
  if (err.status === 429 && typeof err.retryAfterMs === "number") return err.retryAfterMs;
  return fetchRetryBaseWaitMs * 2 ** attempt;
}

async function fetchDocWithRetry(url, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchDoc(url, signal);
    } catch (err) {
      if (!isRetryableFetchError(err) || attempt >= fetchRetryCount) throw err;
      await sleep(fetchRetryWaitMs(err, attempt), signal);
    }
  }
}

// ② 指定された注文の詳細ページから支払金額を集める
async function collectAmounts(orders, force, signal) {
  const targets = pendingTargets(orders, force);
  if (targets.length === 0) {
    addNotice("選択範囲に収集する注文はありません(すべて収集済みです)。");
    return 0;
  }

  let done = 0;
  let failed = 0;
  for (const [index, order] of targets.entries()) {
    // バーの比率はテキストの (n/N件) と同じ1始まりでそろえる。
    // index / N だと表示と1件ずれ、最終件を収集中でも100%にならない
    setProgress(
      `金額を収集中... (${index + 1}/${targets.length}件)`,
      (index + 1) / targets.length
    );
    await publishRunState({
      phase: "金額の収集",
      current: index + 1,
      total: targets.length,
    });

    try {
      const doc = await fetchDocWithRetry(`${ORDER_DETAIL_URL}${order.id}`, signal);
      const detail = parseDetailPage(doc);
      state.cache[order.id] = {
        v: CACHE_SCHEMA_VERSION,
        amount: detail.amount,
        gift: detail.gift,
        status: order.status,
        date: order.date,
        items: detail.items,
        shipping: detail.shipping,
      };
      done++;
      if (done % CACHE_FLUSH_EVERY === 0) await saveCache(state.cache);
    } catch (err) {
      // 中断とログイン切れは続けても仕方がないので、そのまま止める
      if (isFatalFetchError(err)) throw err;
      // それ以外は、この注文を飛ばして先へ進む。キャッシュに残さないので
      // 「未収集」のままになり、再実行すれば自動で拾い直せる
      // (キャッシュへ「取得失敗」として書くと、強制再取得しないと戻せなくなる)
      failed++;
    }

    if (index + 1 < targets.length) await sleep(requestIntervalMs(), signal);
  }

  if (failed > 0) {
    addNotice(
      `金額を収集しました(${done}件)。${failed}件は通信に失敗したため取得できていません。` +
        "未収集のまま残してあるので、再実行すると続きから取得します。"
    );
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
  await collectAmounts(ordersInRange(from, to), forceRefreshRange.checked, signal);
}

async function runAllTask(signal) {
  const force = forceRefreshAll.checked;
  // force でも収集済みのキャッシュはここで消さない。pendingTargets が全件を
  // 対象に返すので、取得できたものから順に上書きされて結果は同じになる。
  // 先に空にすると、時間のかかる①の途中で中断されたときに、
  // 「ここまでに取得した金額は保存されている」という案内に反して全部失われる
  await fetchIndexTask(signal, force);
  await collectAmounts(targetOrders(), force, signal);
}
