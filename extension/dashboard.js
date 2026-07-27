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

// 投稿画面を開くだけで、投稿そのものはユーザーがXの画面で行う
shareBtn.addEventListener("click", () => {
  if (!shareStats) return;
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", buildShareText(shareStats));
  window.open(url.toString(), "_blank", "noopener");
});

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
function buildResults() {
  if (state.index) {
    return targetOrders().map((o) => ({
      id: o.id,
      date: o.date,
      status: o.status,
      amount: state.cache[o.id] ? state.cache[o.id].amount : undefined,
      gift: giftAmount(state.cache[o.id]),
    }));
  }
  // 索引が無い場合(旧バージョンからの移行時)はキャッシュだけで表示する
  return Object.entries(state.cache).map(([id, entry]) => ({
    id,
    date: entry.date,
    status: entry.status,
    amount: entry.amount,
    gift: giftAmount(entry),
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

async function runTask(task) {
  if (running) return;
  setRunning(true);
  clearError();
  clearNotice();
  abortController = new AbortController();
  let aborted = false;

  try {
    await task(abortController.signal);
  } catch (err) {
    if (err.name === "AbortError") {
      aborted = true;
    } else {
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
  }
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

// v1.2以前は全ページの巡回に成功したときだけ索引を保存していたため、
// フラグを持たない索引は「最古まで取得済み」として扱ってよい
function indexIsComplete(index) {
  return Boolean(index) && index.complete !== false;
}

// 一覧ページを読めていないと分かる兆候。どちらの場合も、実際は取得できていない
// 古い注文があるのに「全期間を取得済み」と表示してしまい、少ない合計を
// 正しい合計だと思わせることになるため、完全とは記録しない
function listPageLooksUnreadable({ orders, maxPage, pagerFound }) {
  // 1ページ目から1件も取れない(行のセレクタが効いていない、または購入履歴が空)
  if (orders.length === 0) return true;
  // ページ送りはあるのに、ページ番号を1つも読めない(ページャのセレクタが効いていない)
  return pagerFound && maxPage === 1;
}

// 一覧は新しい順に並んでいるので、既知の注文に当たったらそこから先は取得済み
function appendUntilKnown(target, rows, known) {
  for (const row of rows) {
    if (known.has(row.id)) return true;
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
    reachedKnown = appendUntilKnown(fetched, firstOrders, known);

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
      reachedKnown = appendUntilKnown(fetched, parseListPage(doc).orders, known);
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
    showNotice(
      "購入履歴の一覧をうまく読み取れませんでした。BOOTHに購入履歴が無いか、" +
        "ページの構造が変わっている可能性があります。" +
        "この場合すべての注文を取得できていないため、合計は実際より少なくなります。"
    );
  } else if (reachedKnown) {
    showNotice(
      `取得済みの注文に到達したため、そこで停止しました(以降は読み込み済み)。新しく追加された注文: ${added}件。`
    );
  } else {
    showNotice(`注文履歴を取得しました(新しく追加された注文: ${added}件)。`);
  }
}

// 収集対象の絞り込み。forceが立っている場合は収集済みでも取り直す
function pendingTargets(orders, force) {
  return force ? orders : orders.filter((o) => !state.cache[o.id]);
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
      gift: detail.gift,
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
