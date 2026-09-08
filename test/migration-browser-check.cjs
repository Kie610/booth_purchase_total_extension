"use strict";

// 実際のdashboardを合成ストレージで動かす移行検証。BOOTHへの通信は遮断する。
// 先にrepoをHTTP配信し、NODE_PATHで既存のPlaywrightを指定して実行する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = process.env.BOOTH_TEST_URL || "http://127.0.0.1:8732";
const tests = [];
const check = (name, run) => tests.push({ name, run });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let passed = 0;
  let failed = 0;
  const pageErrors = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.context().route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === "/extension/dashboard.html") {
        const html = fs.readFileSync(path.join(root, "extension/dashboard.html"), "utf8")
          .replace(/<body([^>]*)>/, '<body$1 data-no-auto-init="1">')
          .replace('<script src="common.js">', '<script src="../test/stub.js"></script><script src="common.js">');
        return route.fulfill({ contentType: "text/html", body: html });
      }
      return route.continue();
    });
    await page.goto(base + "/extension/dashboard.html#/backup");
    await page.evaluate(() => {
      window.fixture = {
        index: { complete: true, orders: [{ id: "0001", date: "2026年1月1日 00:00", status: "paid" }] },
        cache: { "0001": { v: 1, amount: 1300, shipping: 200, gift: 0,
          date: "2026年1月1日 00:00", status: "paid",
          items: [{ shop: "例", name: "服", price: 500, quantity: 2, boost: 100, gift: false }] } },
        avatarAssign: { "例 / 服": "manuka" }, giftStatus: {}, migrationConflicts: {},
      };
      window.resetData = (legacy = false) => {
        ext.storage.local._data = structuredClone(domainStorage(fixture));
        if (legacy) delete ext.storage.local._data[DATA_VERSION_KEY];
        applyDomainData({ index: null, cache: {}, avatarAssign: {}, giftStatus: {} });
        render();
      };
      window.incomingData = () => ({ index: null, cache: { "0002": { v: 1, amount: 0, items: [], shipping: 0 } } });
    });

    check("ヘッダーはデータ出力の次がデータの引っ越し", async () => {
      assert.deepEqual(await page.locator('.nav-link').evaluateAll((nodes) => nodes.map((node) => node.dataset.view).slice(-3)), ["gifts", "export", "backup"]);
      assert.equal(await page.locator('#restoreFile').getAttribute('multiple'), '');
    });

    check("無版内部データの取得値を変更せず、旧収集版を維持して版を進める", async () => {
      const result = await page.evaluate(async () => {
        resetData(true);
        const original = structuredClone(ext.storage.local._data);
        const outcome = await runTask(() => {}, { persistCache: false });
        return { outcome, version: ext.storage.local._data[DATA_VERSION_KEY], cache: state.cache,
          original, stored: structuredClone(ext.storage.local._data), pending: ext.storage.local._data[MIGRATION_JOURNAL_KEY] ?? null };
      });
      assert.equal(result.outcome.failed, false);
      assert.equal(result.version, "1.2.1");
      assert.equal(result.cache["0001"].v, 1);
      for (const [key,value] of Object.entries(result.original)) assert.deepEqual(result.stored[key],value);
      assert.equal(result.pending, null);
    });

    check("1.1.0内部データを1.2.0へ変換する", async () => {
      const result = await page.evaluate(async () => {
        resetData(); ext.storage.local._data[DATA_VERSION_KEY] = "1.1.0";
        await runTask(() => {}, { persistCache: false });
        return { version: ext.storage.local._data[DATA_VERSION_KEY], amount: state.cache["0001"].amount };
      });
      assert.deepEqual(result, { version: "1.2.0", amount: 1300 });
    });

    check("未来版の内部データは処理・domain保存を止める", async () => {
      const result = await page.evaluate(async () => {
        resetData(); ext.storage.local._data[DATA_VERSION_KEY] = "99.0.0";
        const before = JSON.stringify(ext.storage.local._data[CACHE_KEY]);
        let called = false;
        const outcome = await runTask(() => { called = true; });
        return { outcome, called, unchanged: before === JSON.stringify(ext.storage.local._data[CACHE_KEY]), version: ext.storage.local._data[DATA_VERSION_KEY] };
      });
      assert.equal(result.outcome.failed, true); assert.equal(result.called, false);
      assert.equal(result.unchanged, true); assert.equal(result.version, "99.0.0");
    });

    check("ロック後の最新値を使い、古いタブから他注文を消さない", async () => {
      const result = await page.evaluate(async () => {
        resetData();
        ext.storage.local._data[CACHE_KEY]["0002"] = { v: 1, amount: 0, items: [] };
        state.cache = { stale: { amount: 999, items: [] } };
        await runTask(() => { state.cache["0001"].amount = 1400; });
        return ext.storage.local._data[CACHE_KEY];
      });
      assert.deepEqual(Object.keys(result).sort(), ["0001", "0002"]);
      assert.equal(result["0001"].amount, 1400); assert.equal(result["0002"].amount, 0);
    });

    check("原本退避の保存失敗では既存domainを変更しない", async () => {
      const result = await page.evaluate(async () => {
        resetData(); const before = JSON.stringify(ext.storage.local._data[CACHE_KEY]);
        const originalSet = ext.storage.local.set;
        ext.storage.local.set = function (data) {
          if (Object.hasOwn(data, MIGRATION_JOURNAL_KEY)) return Promise.reject(new Error("quota fixture"));
          return originalSet.call(this, data);
        };
        let outcome;
        try { outcome = await runTask(async () => persistDomainData(domainStorage(state), mergeBackup(state, incomingData())), { persistCache: false }); }
        finally { ext.storage.local.set = originalSet; }
        return { outcome, unchanged: before === JSON.stringify(ext.storage.local._data[CACHE_KEY]), pending: ext.storage.local._data[MIGRATION_JOURNAL_KEY] ?? null };
      });
      assert.equal(result.outcome.failed, true); assert.equal(result.unchanged, true); assert.equal(result.pending, null);
    });

    for (const phase of ["domain", "cleanup"]) {
      check(`${phase}保存失敗の未完了処理を再起動相当で復旧し、原本を上書きしない`, async () => {
        const result = await page.evaluate(async (phase) => {
          resetData(); const before = structuredClone(domainStorage(fixture));
          const originalSet = ext.storage.local.set;
          const originalRemove = ext.storage.local.remove;
          ext.storage.local.set = function (data) {
            if ((phase === "domain" && Object.hasOwn(data, CACHE_KEY)) ||
                (phase === "cleanup" && data[MIGRATION_JOURNAL_KEY]?.complete)) return Promise.reject(new Error("domain fixture"));
            return originalSet.call(this, data);
          };
          ext.storage.local.remove = function (key) {
            if (phase === "cleanup" && key === MIGRATION_JOURNAL_KEY) return Promise.reject(new Error("cleanup fixture"));
            return originalRemove.call(this, key);
          };
          let outcome;
          try { outcome = await runTask(async () => persistDomainData(domainStorage(state), mergeBackup(state, incomingData())), { persistCache: false }); }
          finally { ext.storage.local.set = originalSet; ext.storage.local.remove = originalRemove; }
          const pendingBefore = structuredClone(ext.storage.local._data[MIGRATION_JOURNAL_KEY].before);
          applyDomainData({ index: null, cache: {} });
          await runTask(() => {}, { persistCache: false });
          const recovery = structuredClone(ext.storage.local._data[MIGRATION_JOURNAL_KEY].before);
          await runTask(() => {}, { persistCache: false });
          return { failed: outcome.failed, before, pendingBefore, recovery,
            ids: Object.keys(state.cache).sort(), pending: ext.storage.local._data[MIGRATION_JOURNAL_KEY] ?? null };
        }, phase);
        assert.equal(result.failed, true); assert.deepEqual(result.pendingBefore, result.before);
        assert.deepEqual(result.recovery, result.before); assert.deepEqual(result.ids, ["0001", "0002"]); assert.equal(result.pending.complete, true); assert.equal(result.pending.after, undefined);
      });
    }

    check("移行読取り失敗では通常finallyのcache保存も走らない", async () => {
      const result = await page.evaluate(async () => {
        resetData(); const before = JSON.stringify(ext.storage.local._data[CACHE_KEY]);
        const originalGet = ext.storage.local.get;
        ext.storage.local.get = function (keys) {
          if (keys.includes(CACHE_KEY)) return Promise.reject(new Error("read fixture"));
          return originalGet.call(this, keys);
        };
        let outcome; let called = false;
        try { outcome = await runTask(() => { called = true; }); }
        finally { ext.storage.local.get = originalGet; }
        return { outcome, called, unchanged: before === JSON.stringify(ext.storage.local._data[CACHE_KEY]) };
      });
      assert.equal(result.outcome.failed, true); assert.equal(result.called, false); assert.equal(result.unchanged, true);
    });

    check("詳細の読み取り失敗でも支払額・明細・CSV原行を保って再試行対象にする", async () => {
      const result = await page.evaluate(async () => {
        resetData();
        ext.storage.local._data[CACHE_KEY]["0001"].csvFacts = [{ kind: "orders", values: { "商品合計": "1100" } }];
        const originalFetch = fetchDocWithRetry;
        const originalParse = parseDetailPage;
        fetchDocWithRetry = async () => document;
        parseDetailPage = () => ({ amount: null, gift: null, items: null, shipping: 0 });
        try { await runTask((signal) => collectAmounts(targetOrders(), true, signal)); }
        finally { fetchDocWithRetry = originalFetch; parseDetailPage = originalParse; }
        return { entry: state.cache["0001"], needs: needsCollect(state.cache["0001"]) };
      });
      assert.equal(result.entry.amount, 1300); assert.equal(result.entry.shipping, 200);
      assert.equal(result.entry.items.length, 1); assert.equal(result.entry.csvFacts[0].values["商品合計"], "1100"); assert.equal(result.needs, true);
    });

    check("JSONとCSVの実画面出力が版付きで、注文0件のメモも読み戻せる", async () => {
      const result = await page.evaluate(async () => {
        resetData();
        const id = "aaaaaaaa-0000-4000-8000-000000000001";
        ext.storage.local._data[CACHE_KEY] = {};
        ext.storage.local._data[INDEX_KEY] = null;
        ext.storage.local._data[GIFT_STATUS_KEY] = { [id]: { state: "received", memo: "保存メモ", checkedAt: 1 } };
        await runTask(() => {}, { persistCache: false });
        const exports = [];
        const originalDownload = downloadFile;
        downloadFile = (text, fileName) => exports.push({ text, fileName });
        const wait = () => new Promise((resolve) => setTimeout(resolve, 30));
        try {
          backupSaveBtn.click(); await wait();
          exportOrdersBtn.click(); await wait();
          exportItemsBtn.click(); await wait();
        } finally { downloadFile = originalDownload; }
        return exports.map(({ text, fileName }) => ({ fileName, text,
          parsed: fileName.endsWith(".json") ? parseBackup(text, fileName) : null }));
      });
      assert.equal(result.length, 3);
      for (const file of result) {
        assert.match(file.fileName, /^booth-(backup|orders|items)-1\.2\.0-\d{8}\.(json|csv)$/);
        // メモを持ち出せるのはJSONだけ。CSVは表示列だけなのでメモを含まない
        if (file.parsed) assert.equal(Object.values(file.parsed.giftStatus)[0].memo, "保存メモ");
        else assert.ok(!file.text.includes("保存メモ"), "CSVはメモを含まない");
      }
    });

    check("複数ファイルの一つが不正なら一件も復元しない", async () => {
      await page.evaluate(() => resetData());
      const before = await page.evaluate(() => JSON.stringify(ext.storage.local._data[CACHE_KEY]));
      const valid = await page.evaluate(() => JSON.stringify(buildBackup(null, incomingData().cache)));
      await page.locator('#restoreFile').setInputFiles([
        { name: "booth-backup-1.2.1-20260907.json", mimeType: "application/json", buffer: Buffer.from(valid) },
        { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("broken") },
      ]);
      await page.waitForFunction(() => restoreStatus.textContent.includes("bad.json"));
      assert.equal(await page.evaluate(() => JSON.stringify(ext.storage.local._data[CACHE_KEY])), before);
    });

    check("容量上限近くの旧データは版の追加だけで移行し、元データを複製しない", async () => {
      const result = await page.evaluate(async () => {
        resetData(true);
        const id="aaaaaaaa-0000-4000-8000-000000000001";
        ext.storage.local._data[GIFT_STATUS_KEY]={[id]:{state:"received",memo:"x".repeat(8_000_000)}};
        const originalSet=ext.storage.local.set;
        let peak=0;
        ext.storage.local.set=function(data){
          const next={...this._data,...data};
          const bytes=new TextEncoder().encode(JSON.stringify(next)).length;
          peak=Math.max(peak,bytes);
          if(bytes>10_485_760)return Promise.reject(new Error("quota fixture"));
          return originalSet.call(this,data);
        };
        let outcome;
        try {outcome=await runTask(()=>{}, {persistCache:false});}
        finally {ext.storage.local.set=originalSet;}
        return {outcome,peak,version:ext.storage.local._data[DATA_VERSION_KEY],length:state.giftStatus[id].memo.length};
      });
      assert.equal(result.outcome.failed,false); assert.equal(result.version,"1.2.0");
      assert.equal(result.length,8_000_000); assert.ok(result.peak<8_100_000);
    });

    check("実変換の原本を同じキーに残し、3MBの移行を10MiB内で完了する", async () => {
      const result=await page.evaluate(async()=>{
        resetData(); ext.storage.local._data[DATA_VERSION_KEY]="1.1.0";
        const id="aaaaaaaa-0000-4000-8000-000000000001";
        ext.storage.local._data[GIFT_STATUS_KEY]={[id]:{state:"received",memo:"x".repeat(3_000_000)}};
        const converter=DATA_MIGRATIONS["1.1.0"]; const originalSet=ext.storage.local.set; let peak=0;
        DATA_MIGRATIONS["1.1.0"]=data=>{const next=converter(data);next.cache["0001"].converted=true;return next;};
        ext.storage.local.set=function(data){
          const next={...this._data,...data};const bytes=new TextEncoder().encode(JSON.stringify(next)).length;
          peak=Math.max(peak,bytes);if(bytes>10_485_760)return Promise.reject(new Error("quota fixture"));
          return originalSet.call(this,data);
        };
        let outcome;
        try{outcome=await runTask(()=>{}, {persistCache:false});}
        finally{DATA_MIGRATIONS["1.1.0"]=converter;ext.storage.local.set=originalSet;}
        const journal=ext.storage.local._data[MIGRATION_JOURNAL_KEY];
        return {outcome,peak,converted:state.cache["0001"].converted,
          beforeConverted:journal.before[CACHE_KEY]["0001"].converted??false,
          originalMemo:journal.before[GIFT_STATUS_KEY][id].memo.length,complete:journal.complete,hasAfter:Object.hasOwn(journal,"after")};
      });
      assert.equal(result.outcome.failed,false);assert.equal(result.converted,true);assert.equal(result.beforeConverted,false);
      assert.equal(result.originalMemo,3_000_000);assert.equal(result.complete,true);assert.equal(result.hasAfter,false);
      assert.ok(result.peak<10_485_760);
    });

    check("JSON書出しは保存禁止でも未完了の両側を持ち出せる", async () => {
      const result = await page.evaluate(async () => {
        resetData(); const merged=mergeBackup(fixture,incomingData());
        ext.storage.local._data[MIGRATION_JOURNAL_KEY]={before:domainStorage(fixture),after:domainStorage(merged)};
        migrationBlocked=true; render();
        const originalSet=ext.storage.local.set; const originalRemove=ext.storage.local.remove; const originalDownload=downloadFile;
        let writes=0, output=null;
        ext.storage.local.set=()=>{writes++;return Promise.reject(new Error("quota fixture"));};
        ext.storage.local.remove=()=>{writes++;return Promise.reject(new Error("remove fixture"));};
        downloadFile=(text,fileName)=>{output=parseBackup(text,fileName);};
        let failedRun, enabled;
        try {
          failedRun=await runTask(()=>{});
          enabled=!backupSaveBtn.disabled;
          writes=0;
          backupSaveBtn.click(); await new Promise(resolve=>setTimeout(resolve,30));
        }
        finally {ext.storage.local.set=originalSet;ext.storage.local.remove=originalRemove;downloadFile=originalDownload;}
        return {writes,output,failedRun,enabled};
      });
      assert.equal(result.failedRun.failed,true); assert.equal(result.enabled,true);
      assert.equal(result.writes,0); assert.equal(result.output.ok,true);
      assert.deepEqual(Object.keys(result.output.cache).sort(),["0001","0002"]);
    });

    check("実際の2タブで同時更新を拒否し、順次更新は両方の注文を残す", async () => {
      const context = page.context();
      let shared = await page.evaluate(() => domainStorage(fixture));
      await context.exposeBinding("migrationTestGet", (_, keys) =>
        structuredClone(Object.fromEntries([].concat(keys).filter(key=>Object.hasOwn(shared,key)).map(key=>[key,shared[key]]))));
      await context.exposeBinding("migrationTestSet", (_, data) => { Object.assign(shared,structuredClone(data)); });
      await context.exposeBinding("migrationTestRemove", (_, key) => { delete shared[key]; });
      const other = await context.newPage();
      try {
        await other.goto(base + "/extension/dashboard.html#/backup");
        for (const tab of [page, other]) await tab.evaluate(() => {
          ext.storage.local.get = keys => window.migrationTestGet(keys);
          ext.storage.local.set = data => window.migrationTestSet(data);
          ext.storage.local.remove = key => window.migrationTestRemove(key);
        });
        const first = page.evaluate(() => runTask(async () => {
          await new Promise(resolve=>setTimeout(resolve,150));
          state.cache["1001"]={amount:10,items:[],v:1};
        }));
        await page.waitForFunction(() => running);
        const concurrent = await other.evaluate(() => runTask(() => { state.cache.bad={amount:99,items:[]}; }));
        assert.equal(concurrent.locked,true);
        assert.equal((await first).failed,false);
        const sequential = await other.evaluate(() => runTask(() => { state.cache["1002"]={amount:20,items:[],v:1}; }));
        assert.equal(sequential.failed,false);
        assert.deepEqual(Object.keys(shared.boothOrderCache).sort(),["0001","1001","1002"]);
      } finally { await other.close(); }
    });

    for (const test of tests) {
      try { await test.run(); passed++; console.log(`PASS ${test.name}`); }
      catch (error) { failed++; console.error(`FAIL ${test.name}\n${error.stack}`); }
    }
    assert.deepEqual(pageErrors, [], "pageerrorがないこと");
    console.log(JSON.stringify({ total: tests.length, passed, failed, pageErrors: pageErrors.length }));
    process.exitCode = failed ? 1 : 0;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
