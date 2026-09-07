'use strict';
// Review evidence uses synthetic data and the real dashboard HTML with test storage injected.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Kie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo = path.resolve(__dirname, '../../../..');
const out = __dirname;
const fixture = (n) => {
  const orders = [], cache = {}, giftStatus = {};
  for (let i = 1; i <= n; i++) {
    const id = String(90000000 + i), date = `2026年${i % 8 + 1}月${i % 28 + 1}日 12:34`;
    const giftId = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    const gift = i % 3 === 0;
    orders.push({ id, date, status: 'completed' });
    cache[id] = { v: 2, date, status: 'completed', amount: 2000, shipping: 0, gift: gift ? 2000 : 0,
      items: [{ shop: `合成ショップ${i % 7}`, shopUrl: `https://synthetic${i % 7}.booth.pm/`,
        name: `合成衣装${i}（マヌカ対応）`, price: 2000, quantity: 1, boost: 0, gift, ...(gift ? {giftId} : {}) }] };
    if (gift && i % 4 !== 0) giftStatus[giftId] = { state: i % 2 ? 'received' : 'unreceived', receivedAt: i % 2 ? '2026年8月1日' : null, memo: `合成メモ${i}`, checkedAt: Date.now() };
  }
  return { boothOrderIndex: { updatedAt: new Date().toISOString(), complete: true, orders }, boothOrderCache: cache, boothGiftStatus: giftStatus };
};
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: {width: 1280, height: 900}, locale: 'ja-JP' });
  const page = await context.newPage();
  const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { blocked.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const screensOnly = process.argv.includes('--screens-only');
  const result = screensOnly ? JSON.parse(fs.readFileSync(path.join(out, 'browser-results.json'), 'utf8')) : { browser: browser.version(), viewport: [1280,900] };
  if (!screensOnly) {
  await page.goto('http://127.0.0.1:8732/test/index.html');
  await page.waitForFunction(() => /ALL PASS|\d+ FAILED|^ERROR/.test(document.getElementById('out').textContent), {timeout: 90000});
  const baseline = await page.locator('#out').innerText();
  fs.writeFileSync(path.join(out, 'baseline.txt'), baseline);
  result.baseline = baseline.split('\n').slice(-2).join('\n');
  result.baselineErrors = errors.splice(0);
  }
  const original = fs.readFileSync(path.join(repo, 'extension/dashboard.html'), 'utf8');
  const stub = fs.readFileSync(path.join(repo, 'test/stub.js'), 'utf8');
  await page.route('**/extension/dashboard.html', route => route.fulfill({ contentType: 'text/html',
    body: original.replace('<script src="common.js">', `<script>${stub}\nbrowser.storage.local._data = ${JSON.stringify(fixture(48))};</script>\n<script src="common.js">`) }));
  await page.goto('http://127.0.0.1:8732/extension/dashboard.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state.index?.orders.length === 48);
  result.contrast = await page.evaluate(() => {
    const b = document.getElementById('runAllBtn'), s = getComputedStyle(b);
    const luminance = c => c.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const a=luminance(s.color), z=luminance(s.backgroundColor);
    return {element:b.id,text:b.textContent,disabled:b.disabled,color:s.color,background:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,ratio:(Math.max(a,z)+.05)/(Math.min(a,z)+.05)};
  });
  result.pages = [];
  for (const view of ['report','ranking','avatars','trends','summary','export','backup','gifts']) {
    await page.locator(`a[data-view="${view}"]`).click();
    await page.waitForFunction(v => !document.getElementById('view-' + v).hidden, view);
    const observation = await page.evaluate(v => ({ view:v, title:document.getElementById('viewTitle').textContent,
      bodyWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth,
      heading:document.getElementById('view-'+v).innerText.slice(0,650),
      focused:{tag:document.activeElement.tagName,text:document.activeElement.textContent.slice(0,100)} }), view);
    await page.screenshot({path:path.join(out, view+'-1280.png')});
    result.pages.push(observation);
  }
  await page.evaluate(() => { setGiftFilter('self'); location.hash='#/gifts'; renderCurrentView(); });
  result.giftFilterTitle = await page.locator('#viewTitle').innerText();
  result.giftFilterBarHidden = await page.locator('#giftFilterBar').evaluate(e => e.hidden);
  await page.screenshot({path:path.join(out, 'gifts-filter-1280.png')});
  await page.setViewportSize({width:620,height:900});
  await page.screenshot({path:path.join(out, 'gifts-620.png')});
  result.gifts620 = await page.evaluate(() => ({viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,
    overflows:[...document.querySelectorAll('#view-gifts table')].map(e=>({width:e.getBoundingClientRect().width,parentWidth:e.parentElement.clientWidth,scroll:e.parentElement.scrollWidth,overflow:getComputedStyle(e.parentElement).overflowX}))}));
  await page.setViewportSize({width:1280,height:900});
  if (!screensOnly) {
  result.renderBench = [];
  for (const n of [1000,5000]) {
    const data = fixture(n);
    await page.evaluate(d => { state.index=d.boothOrderIndex; state.cache=d.boothOrderCache; state.giftStatus=d.boothGiftStatus; setGiftFilter('all'); location.hash='#/export'; render(); }, data);
    const samples = await page.evaluate(() => { const s=[]; for(let i=0;i<5;i++){const t=performance.now(); render(); s.push(performance.now()-t);} return s; });
    result.renderBench.push({orders:n,items:n,currentView:'export',samplesMs:samples,medianMs:[...samples].sort((a,b)=>a-b)[2]});
  }
  // Parsing without attachment: local request events determine this browser's behavior.
  const resourceRequests=[];
  page.on('request', r => { if(r.url().includes('/review-pixel')) resourceRequests.push(r.url()); });
  await page.evaluate(() => { window.reviewInert = new DOMParser().parseFromString('<img src="http://127.0.0.1:8732/review-pixel-img"><iframe src="http://127.0.0.1:8732/review-pixel-frame"></iframe>', 'text/html'); });
  await page.waitForTimeout(700);
  result.inertParser = {resourceRequests,retainedDocument:true,observationWindowMs:700};
  }
  result.dashboardErrors=errors;
  result.blockedExternalRequests=blocked;
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(result,null,2));
  console.log(JSON.stringify({baseline:result.baseline,baselineErrors:result.baselineErrors,pages:result.pages.length,giftFilterTitle:result.giftFilterTitle,gifts620:result.gifts620,renderBench:result.renderBench,dashboardErrors:errors,blockedExternalRequests:blocked.length}));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode=1; });
