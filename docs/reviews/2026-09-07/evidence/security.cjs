"use strict";

// Synthetic review checks only. No browser storage or BOOTH traffic is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../../..");
const read = (name) => fs.readFileSync(path.join(root, "extension", name), "utf8");
const stored = {};
const state = { index: null, cache: {}, avatarAssign: {}, giftStatus: {} };
const context = vm.createContext({
  chrome: { storage: { local: {
    get: async (keys) => Object.fromEntries(keys.map((key) => [key, stored[key]])),
    set: async (value) => Object.assign(stored, structuredClone(value)),
    remove: async (key) => { delete stored[key]; },
  } } },
  state,
  expandedMonthYears: new Set(),
  expandedPeriodYears: new Set(),
  render() {},
  buildSummary: () => ({}),
});
for (const file of ["common.js", "backup.js", "csv.js"]) vm.runInContext(read(file), context, { filename: file });
const dashboard = read("dashboard.js");
vm.runInContext(dashboard.slice(dashboard.indexOf("async function clearIndexData()"), dashboard.indexOf("// ---- 状態からの導出")), context);
const shopPattern = read("dashboard-insights-view.js").match(/^const SHOP_URL_PATTERN = .*;$/m)[0];
vm.runInContext(shopPattern, context);
const run = (source) => vm.runInContext(source, context);
const results = [];
function check(name, test) {
  try { test(); results.push({ name, status: "passed" }); }
  catch (error) { results.push({ name, status: "failed", error: error.message }); }
}

(async () => {
  check("CSV formula prefix survives shared csvField", () => assert.equal(run('csvField("=1+1")'), "=1+1"));
  // SEC-01 の修正後は、明細出力の側で先頭の = を ' で無害化する(共有の csvField は変えていない)。
  // 列は 1.2.0 でデータバージョン・復元用データが続くので行末では見ない
  check("CSV formula is neutralized in actual item export", () => {
    const csv = run('buildItemsCsv([{ id:"123", date:"2026年9月1日 00:00", status:"completed", items:[{shop:"=1+1",shopUrl:"https://example.booth.pm/",name:"=2+2",price:100,quantity:1,boost:0,gift:false}] }], "all")');
    assert.match(csv, /,'=1\+1,https:\/\/example\.booth\.pm\/,'=2\+2,100,1,0,いいえ,/m);
  });
  check("CSV quote escaping does not neutralize formulas", () => assert.equal(run('csvField(\'=SUM(1,2)\')'), '"=SUM(1,2)"'));
  check("Unsafe shop origins are rejected", () => {
    for (const url of ["javascript:alert(1)", "https://shop.booth.pm.evil.invalid/", "https://shop.booth.pm@evil.invalid/", "https://shop.booth.pm/../?x=1", "https://shop.booth.pm\\@evil.invalid/"]) {
      context.probeUrl = url;
      assert.equal(run("SHOP_URL_PATTERN.test(probeUrl)"), false, url);
    }
  });
  check("Order traversal rejected at shared URL builder", () => assert.equal(run('orderDetailUrl("../users")'), null));
  check("Gift traversal rejected at both URL builders", () => assert.equal(run('giftPageUrl("../users") === null && giftShareUrl("../users") === null'), true));
  check("Valid URLs retain fixed origins", () => assert.equal(run('giftShareUrl("aaaaaaaa-0000-4000-8000-000000000001")'), "https://booth.pm/gifts/aaaaaaaa-0000-4000-8000-000000000001"));
  const giftId = "aaaaaaaa-0000-4000-8000-000000000001";
  state.index = { orders: [{ id: "123", status: "completed", date: "2026年9月1日" }] };
  state.cache = { "123": { v: 2, amount: 100, items: [{ shop: "Synthetic shop", shopUrl: "https://example.booth.pm/", name: "Synthetic item", price: 100, quantity: 1, boost: 0, gift: true, giftId }] } };
  state.avatarAssign = { "Synthetic shop / Synthetic item": "Synthetic avatar" };
  state.giftStatus = { [giftId]: { state: "unreceived", memo: "Synthetic private memo", checkedAt: 1 } };
  await run("saveIndex(state.index)");
  await run("saveCache(state.cache)");
  await run("saveAvatarAssign(state.avatarAssign)");
  await run("saveGiftStatus(state.giftStatus)");
  check("Backup preserves redeemable gift ID", () => assert.equal(JSON.parse(run("JSON.stringify(buildBackup(state.index,state.cache,undefined,state.avatarAssign))")).cache["123"].items[0].giftId, giftId));
  await run("clearIndexData()");
  await run("clearAmountsData()");
  check("Both delete actions clear index and amount cache", () => { assert.equal(stored.boothOrderIndex, undefined); assert.deepEqual(stored.boothOrderCache, {}); });
  check("Both delete actions retain gift UUID and memo", () => assert.equal(stored.boothGiftStatus[giftId].memo, "Synthetic private memo"));
  check("Both delete actions retain product assignment", () => assert.equal(stored.boothAvatarAssign["Synthetic shop / Synthetic item"], "Synthetic avatar"));
  const counts = { passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length, skipped: 0, notRun: 0 };
  const output = { scope: "Synthetic Node VM checks; passes confirm observed behavior, including defects", counts, results };
  fs.writeFileSync(path.join(__dirname, "security-results.json"), JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = counts.failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
