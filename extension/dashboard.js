"use strict";

// 集計ページの中枢。状態を持ち、イベントを受け取り、BOOTHから取得する。
// ページの読み取りは dashboard-parse.js、画面への反映は dashboard-view.js。
// この3つは classic script として同じグローバルを共有する(モジュールではない)。

const ORDERS_INDEX_URL = "https://accounts.booth.pm/orders";
const ORDER_DETAIL_URL = "https://accounts.booth.pm/orders/";
const REQUEST_INTERVAL_MS = 250; // サーバーへの負荷を抑えるための待機時間
const CACHE_FLUSH_EVERY = 5; // 取得途中で中断されても失わないよう小まめに保存する
const RUN_STATE_INTERVAL_MS = 400; // ポップアップへ進捗を渡す書き込みの間引き
const EXCLUDED_STATUSES = new Set(["cancelled"]);

let running = false;
let abortController = null;
let lastRunStateWrite = 0;
const state = { index: null, cache: {} };

// ---- イベント配線 ------------------------------------------------------

// 画面の切り替え。移動しても同じJSコンテキストのままなので、収集は止まらない
menuBtn.addEventListener("click", () => setDrawerOpen(!drawerIsOpen()));
navOverlay.addEventListener("click", () => setDrawerOpen(false));
navDrawer.addEventListener("click", (event) => {
  // リンクの既定動作でハッシュが変わり、hashchange 側で描画が切り替わる
  if (event.target.closest(".nav-link")) setDrawerOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawerIsOpen()) setDrawerOpen(false);
});
window.addEventListener("hashchange", () => {
  renderCurrentView();
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
  const url = URL.createObjectURL(new Blob([text], { type }));
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
rangeFrom.addEventListener("change", onRangeChanged);
rangeTo.addEventListener("change", onRangeChanged);

function onRangeChanged() {
  highlightSelectedRange();
  updatePlannedCount();
}

// 投稿画面を開くだけで、投稿そのものはユーザーがXの画面で行う。
// 未収集が残ったまま「合計」を名乗ると実際より少ない額が外に出てしまうため、
// その場合は今年分だけを収集し、今年の金額だけを共有する
shareBtn.addEventListener("click", async () => {
  if (!shareStats || running) return;

  if (!canShareTotal(shareStats)) {
    if (!confirm(shareConfirmMessage(shareStats))) return;
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
  openShareWindow();
});

function openShareWindow() {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", buildShareText(shareStats));
  // 収集を挟むとクリックから時間が空くため、ブラウザに止められることがある。
  // 収集は済んでいるので、押し直せば今度はその場で開ける
  if (!window.open(url.toString(), "_blank", "noopener")) {
    addNotice(
      "ブラウザに新しいタブを止められました。もう一度「Xで共有」を押してください。"
    );
  }
}

// 取り直しに時間がかかるので、消す前に必ず確認する
clearIndexBtn.addEventListener("click", async () => {
  if (running) return;
  const count = state.index ? state.index.orders.length : 0;
  if (count === 0) return;
  if (!confirm(`注文履歴のキャッシュ(${count}件)を削除します。\n収集した金額は残ります。よろしいですか?`)) return;
  await clearIndexData();
  showNotice(`注文履歴のキャッシュを削除しました(${count}件)。`);
});

clearAmountsBtn.addEventListener("click", async () => {
  if (running) return;
  const count = Object.keys(state.cache).length;
  if (count === 0) return;
  if (!confirm(`収集した金額のキャッシュ(${count}件)を削除します。\n注文履歴は残ります。よろしいですか?`)) return;
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
    if (event.target.closest(".toggle")) {
      toggleYearRow(monthTableBody, expandedMonthYears, yearRow);
    } else {
      setRange(yearRow.dataset.rangeFrom, yearRow.dataset.rangeTo);
    }
    return;
  }
  const monthRow = event.target.closest("tr.month-row");
  if (monthRow) setRange(monthRow.dataset.monthKey, monthRow.dataset.monthKey);
});

// こちらは範囲指定に関わらないので、年の行のどこを押しても開閉するだけ
periodTableBody.addEventListener("click", (event) => {
  if (running) return;
  const yearRow = event.target.closest("tr.year-row");
  if (yearRow) toggleYearRow(periodTableBody, expandedPeriodYears, yearRow);
});

// テストでは state を直接差し替えて描画や取得を検証するため、
// 保存データの読み込みは走らせない(非同期で state を上書きして競合するため)
if (!document.body.dataset.noAutoInit) init();

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

// ポップアップ側で進捗を表示できるようにストレージへ書き出す(書き込み過多を避けて間引く)
async function publishRunState(runState, force) {
  const now = Date.now();
  if (!force && now - lastRunStateWrite < RUN_STATE_INTERVAL_MS) return;
  lastRunStateWrite = now;
  await saveRunState(runState);
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

// 繰り返しても結果が変わらない失敗(中断・ログイン切れ)かどうか
function isFatalFetchError(err) {
  return err.name === "AbortError" || err.name === "LoginRequiredError";
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
    throw new Error(`ページの取得に失敗しました (HTTP ${res.status}): ${url}`);
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
function listPageLooksUnreadable({ orders, maxPage, pagerFound }) {
  // 1ページ目から1件も取れない(行のセレクタが効いていない、または購入履歴が空)
  if (orders.length === 0) return true;
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
  let added = 0;

  try {
    setProgress("購入履歴の1ページ目を取得中...", 0);
    await publishRunState({ phase: "注文履歴の取得", current: 0, total: 0 }, true);

    const firstDoc = await fetchDoc(ORDERS_INDEX_URL, signal);
    const firstPage = parseListPage(firstDoc);
    const { orders: firstOrders, maxPage } = firstPage;
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
      await sleep(REQUEST_INTERVAL_MS, signal);
      const doc = await fetchDoc(`${ORDERS_INDEX_URL}?page=${page}`, signal);
      reachedKnown = appendUnknown(
        fetched,
        parseListPage(doc).orders,
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
  }

  if (unreadable) {
    addNotice(
      "購入履歴の一覧をうまく読み取れませんでした。BOOTHに購入履歴が無いか、" +
        "ページの構造が変わっている可能性があります。" +
        "この場合すべての注文を取得できていないため、合計は実際より少なくなります。"
    );
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
let fetchRetryWaitMs = 2000;

async function fetchDocWithRetry(url, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchDoc(url, signal);
    } catch (err) {
      if (isFatalFetchError(err) || attempt >= fetchRetryCount) throw err;
      await sleep(fetchRetryWaitMs, signal);
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
    setProgress(
      `金額を収集中... (${index + 1}/${targets.length}件)`,
      index / targets.length
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

    if (index + 1 < targets.length) await sleep(REQUEST_INTERVAL_MS, signal);
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
