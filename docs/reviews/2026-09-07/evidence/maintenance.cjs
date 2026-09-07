'use strict';
// Synthetic review evidence. Runs repository aggregation with no DOM, personal data, or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const repo = path.resolve(__dirname, '../../../..');
const source = (name) => fs.readFileSync(path.join(repo, 'extension', name), 'utf8');
const sandbox = vm.createContext({ chrome: {} });
vm.runInContext(source('avatar-master.js') + '\n' + source('common.js'), sandbox);
let passed = 0;
const test = (name, body) => { body(); passed++; console.log('PASS ' + name); };
const renderSource = source('dashboard-view.js').match(/function render\(\) \{[\s\S]*?\n\}/)[0];
const renderCalls = [...renderSource.matchAll(/\b(render\w*|refreshResults|updatePlannedCount)\(/g)].map(m => m[1]).filter(n => n !== 'render');
const calls = [];
const renderSandbox = { Date };
for (const name of new Set(renderCalls)) renderSandbox[name] = () => { calls.push(name); return []; };
vm.runInNewContext(renderSource + '\nrender();', renderSandbox);
test('full render builds both avatar and gift views unconditionally', () => {
  assert(calls.includes('renderAvatarArea'));
  assert(calls.includes('renderYearSummary'));
  assert(calls.includes('renderGiftArea'));
});
console.log('full-render calls: ' + calls.join(', '));
const giftId = '00000000-0000-0000-0000-000000000001';
sandbox.giftFixture = [{ giftId, state: 'received' }];
test('force rechecks received gifts despite unconditional exclusion comments', () => {
  assert.equal(vm.runInContext('giftIdsToCheck(giftFixture).length', sandbox), 0);
  assert.equal(vm.runInContext('giftIdsToCheck(giftFixture, true).length', sandbox), 1);
});
const extFiles = fs.readdirSync(path.join(repo, 'extension')).filter(f => f.endsWith('.js'));
const testFiles = fs.readdirSync(path.join(repo, 'test')).filter(f => f.endsWith('.js'));
const allCode = extFiles.map(source).concat(testFiles.map(f => fs.readFileSync(path.join(repo, 'test', f), 'utf8'))).join('\n');
// EFF-03 の修正で未使用の headingLabel は削除済み。復活しないことを見張る
test('headingLabel no longer exists across extension and test JavaScript', () => {
  assert.equal((allCode.match(/\bheadingLabel\b/g) || []).length, 0);
});
test('summary BOOST fields have no production property readers', () => {
  const production = extFiles.map(source).join('\n');
  assert.equal((production.match(/\.boostItemCount\b/g) || []).length, 0);
  assert.equal((production.match(/\b(?:stats|summary|summaryShareStats)\.boost\b/g) || []).length, 0);
});
test('flush interval caps at 50, so 10000 successes require 200 periodic full writes', () => {
  const text = source('dashboard.js');
  const interval = text.match(/function cacheFlushInterval\(total\) \{[\s\S]*?\n\}/)[0];
  const every = vm.runInNewContext(interval + '\ncacheFlushInterval(10000)', { CACHE_FLUSH_MIN: 5, CACHE_FLUSH_MAX: 50 });
  assert.equal(every, 50);
  assert.equal(Math.floor(10000 / every), 200);
});
function fixture(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1), date: `2026年${i % 12 + 1}月${i % 28 + 1}日 12:34`,
    status: 'completed', amount: 2000, gift: 0, shipping: 0, v: 2,
    items: [{ name: `合成衣装${i}（マヌカ対応）`, shop: `合成ショップ${i % 100}`, shopUrl: `https://synthetic${i % 100}.booth.pm/`, price: 2000, boost: 0, quantity: 1, gift: false }],
  }));
}
for (const n of [1000, 5000, 10000]) {
  sandbox.rows = fixture(n);
  const samples = [];
  vm.runInContext('aggregateByAvatar(rows); buildYearSummary(rows, 2026);', sandbox);
  for (let k = 0; k < 5; k++) {
    const start = performance.now();
    vm.runInContext('aggregateByAvatar(rows); aggregateByAvatar(rows); buildYearSummary(rows, 2026);', sandbox);
    samples.push(performance.now() - start);
  }
  samples.sort((a,b) => a-b);
  console.log(JSON.stringify({ kind: 'node-synthetic-aggregation-only', orders: n, items: n, samples: 5, medianMs: +samples[2].toFixed(1), minMs: +samples[0].toFixed(1), maxMs: +samples[4].toFixed(1), work: '2x aggregateByAvatar + buildYearSummary; all orders same year; excludes DOM and other render work' }));
}
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, notRun: ['browser render timing', 'live BOOTH', 'real extension'] }));
