"use strict";

// Read-only adversarial checks of the shipped functions, with synthetic storage
// and inert documents. No browser, credentials, network or user data is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../../..");
const read = (name) => fs.readFileSync(path.join(root, "extension", name), "utf8");
const dashboard = read("dashboard.js");
const clone = (value) => structuredClone(value);
const order = (id) => ({ id, status: "completed", date: "2026/09/01" });
const entry = (amount) => ({
  v: 2, amount, gift: 0, shipping: 0, status: "completed", date: "2026/09/01",
  items: [{ name: "Synthetic item", shop: "Synthetic shop", price: amount, gift: false }],
});
const indexOf = (...ids) => ({ complete: true, orders: ids.map(order) });

function shippedFunction(name) {
  const pattern = new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m");
  const source = dashboard.match(pattern)?.[0];
  assert.ok(source, `Missing shipped function: ${name}`);
  return source;
}

function environment(stored = {}) {
  const local = {
    async get(keys) {
      return clone(Object.fromEntries([].concat(keys)
        .filter((key) => key in stored).map((key) => [key, stored[key]])));
    },
    async set(values) { Object.assign(stored, clone(values)); },
    async remove(key) { delete stored[key]; },
  };
  const ctx = vm.createContext({
    browser: { storage: { local } }, console, AbortController,
    setInterval: () => 1, clearInterval: () => {},
    clearError() {}, clearNotice() {}, showError() {}, showNotice() {}, addNotice() {},
    render() {}, refreshResults() {}, restoreDocumentTitle() {}, setProgress() {},
    publishRunState: async () => {}, setCollectHealth() {}, sleep: async () => {},
    requestIntervalMs: () => 0,
    fetchDocWithRetry: async () => ({ querySelectorAll: () => [] }),
  });
  for (const name of ["common.js", "backup.js", "dashboard-parse.js"]) {
    vm.runInContext(read(name), ctx, { filename: name });
  }
  vm.runInContext(dashboard.split("// ---- イベント配線")[0], ctx, { filename: "dashboard-prefix.js" });
  for (const name of ["targetOrders", "skippedCount", "buildAllResults", "buildSummary",
    "runTask", "lockedRunResult", "runTaskWithLease", "pendingTargets", "collectAmounts",
    "isFatalFetchError", "collectRangeTask", "fetchIndexTask", "appendUnknown",
    "statusRefreshCutoff", "commitIndex", "listPageLooksUnreadable", "syncCacheStatuses",
    "pruneCacheAfterFullIndexRefresh", "clearIndexData",
    // 1.2.0 のデータ移行で保存経路に加わった関数。無いと保存が黙って失敗し、検証が成立しない
    "applyDomainData", "domainStorage", "parseStoredDomain", "finishPendingMigration",
    "persistDomainData", "loadCurrentDomain"]) {
    vm.runInContext(shippedFunction(name), ctx, { filename: `dashboard.js:${name}` });
  }
  vm.runInContext("function setRunning(value) { running = value; }", ctx);
  vm.runInContext(dashboard.match(/^const SETTLED_STATUSES[^]*?;/m)[0], ctx);
  ctx.expandedMonthYears = new Set();
  ctx.expandedPeriodYears = new Set();
  const run = (source) => vm.runInContext(source, ctx);
  // 1.2.0 からタスク開始時に保存データを読み直す(applyDomainData(await loadCurrentDomain()))ので、
  // state だけでなく合成ストレージにも同じ内容を置く
  const seed = (index, cache) => {
    ctx.syntheticIndex = clone(index);
    ctx.syntheticCache = clone(cache);
    run("state.index = syntheticIndex; state.cache = syntheticCache");
    Object.assign(stored, run("domainStorage(state)"));
  };
  return { ctx, run, seed, stored };
}

let passed = 0;
let failed = 0;
async function check(name, task) {
  try {
    await task();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

(async () => {
  await check("control: empty detail document is explicitly unreadable", async () => {
    const env = environment();
    const result = env.run("parseDetailPage({querySelectorAll: () => []})");
    assert.equal(result.amount, null);
    assert.equal(result.items, null);
  });

  await check("A1: failed forced parse must retain last valid payment", async () => {
    const env = environment();
    env.seed(indexOf("1001"), { "1001": entry(1234) });
    await env.run("runTask(signal => collectAmounts(targetOrders(), true, signal))");
    assert.equal(env.stored.boothOrderCache["1001"].amount, 1234,
      `valid amount 1234 was overwritten with ${env.stored.boothOrderCache["1001"].amount}`);
  });

  await check("A2: sequential second dashboard must retain first dashboard's completed data", async () => {
    const stored = {};
    const first = environment(stored);
    const second = environment(stored);
    first.seed(indexOf("1001", "1002"), { "1001": entry(100), "1002": entry(200) });
    await first.run("runTask(async () => {})");
    assert.equal(stored.boothOrderCache["1002"].amount, 200);
    // 2つ目のタブは古い状態をメモリにだけ持つ(保存には書かない)。
    // タスク開始時に保存データを読み直す設計なので、古いメモリで保存を上書きしてはいけない
    second.ctx.staleIndex = indexOf("1001", "1002");
    second.ctx.staleCache = { "1001": entry(100) };
    second.run("state.index = staleIndex; state.cache = staleCache");
    second.ctx.parseListPage = () => ({
      orders: [order("1001")], maxPage: 1, pagerFound: false, emptyFound: false,
    });
    await second.run("runTask(signal => fetchIndexTask(signal, false))");
    assert.equal(stored.boothOrderCache["1002"]?.amount, 200,
      `second tab's index-only fetch erased order 1002; remaining ids=${Object.keys(stored.boothOrderCache)}`);
  });

  await check("A3: accepted duplicate IDs must not double the restored total", async () => {
    const env = environment();
    env.ctx.syntheticBackupText = JSON.stringify({
      format: "booth-purchase-report", version: 1, exportedAt: "2026-09-07T00:00:00Z",
      index: indexOf("1001", "1001"), cache: { "1001": entry(1234) },
    });
    const result = env.run(`
      const parsed = parseBackup(syntheticBackupText);
      if (!parsed.ok) ({ accepted: false });
      else {
        const merged = mergeBackup(state, parsed);
        state.index = merged.index;
        state.cache = merged.cache;
        ({ accepted: true, total: buildSummary(false).total, rows: state.index.orders.length });
      }
    `);
    assert.ok(!result.accepted || result.total === 1234,
      `accepted=${result.accepted}, total=${result.total}, expected=1234, rows=${result.rows}`);
  });

  await check("control: duplicate incoming IDs are deduplicated if an index already exists", async () => {
    const env = environment();
    env.ctx.duplicateIndex = indexOf("1001", "1001");
    assert.equal(env.run("mergeOrderIndex({orders:[],complete:true}, duplicateIndex).orders.length"), 1);
  });

  await check("A4: removing the index must not restore a known cancelled payment to the total", async () => {
    const env = environment();
    const oldIndex = indexOf("1001");
    oldIndex.orders[0].status = "paid";
    env.seed(oldIndex, { "1001": { ...entry(1234), status: "paid" } });
    env.ctx.parseListPage = () => ({
      orders: [{ ...order("1001"), status: "cancelled" }],
      maxPage: 1, pagerFound: false, emptyFound: false,
    });
    await env.run("runTask(signal => fetchIndexTask(signal, false, true))");
    assert.equal(env.run("buildSummary(false).total"), 0);
    assert.equal(env.run("state.cache['1001'].status"), "cancelled");
    await env.run("clearIndexData()");
    assert.equal(env.stored.boothSummary.total, 0,
      `cancelled payment reappeared: total=${env.stored.boothSummary.total}`);
  });

  await check("A5: accepted backup giftId must be safe for the first render", async () => {
    const env = environment();
    const brokenEntry = entry(1234);
    brokenEntry.items[0].gift = true;
    brokenEntry.items[0].giftId = { toString: null };
    env.ctx.syntheticBackupText = JSON.stringify({
      format: "booth-purchase-report", version: 1, exportedAt: "2026-09-07T00:00:00Z",
      index: indexOf("1001"), cache: { "1001": brokenEntry },
    });
    await env.run(`
      (async () => {
        const parsed = parseBackup(syntheticBackupText);
        if (!parsed.ok) return;
        const merged = mergeBackup(state, parsed);
        state.index = merged.index;
        state.cache = merged.cache;
        await saveCache(state.cache);
        buildGiftRows(buildAllResults(), state.giftStatus);
      })()
    `);
  });

  console.log(JSON.stringify({ passed, failed, skipped: 0, notRun: 0 }));
  process.exitCode = failed ? 1 : 0;
})();
