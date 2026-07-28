const lines = [];
let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}` + (ok ? "" : `\n        expected=${e}\n        actual  =${a}`));
}
function parse(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// --- parseOrderDate の表記ゆれ吸収 ---
check("parseOrderDate 和暦区切り", parseOrderDate("2024年5月3日 12:34"), { year: 2024, month: 5, day: 3, sortKey: 20240503 });
check("parseOrderDate スラッシュ", parseOrderDate("2024/05/03 12:34"), { year: 2024, month: 5, day: 3, sortKey: 20240503 });
check("parseOrderDate ハイフン", parseOrderDate("2023-07-15 18:20"), { year: 2023, month: 7, day: 15, sortKey: 20230715 });
check("parseOrderDate 解析不能", parseOrderDate("不明"), null);
check("formatYen", formatYen(1234567), "¥1,234,567");

// --- 月の識別子(範囲比較に使うため0埋めして文字列比較が日付順になること) ---
check("monthKeyOf 0埋め", monthKeyOf("2024年5月3日 12:34"), "2024-05");
check("monthKeyOf 解析不能", monthKeyOf("不明"), null);
check("monthKeyOf 文字列比較の順序", "2024-05" < "2024-12", true);
check("monthKeyOf 年をまたぐ比較", "2023-12" < "2024-01", true);
check("monthLabel", monthLabel("2024-05"), "2024年5月");
check("monthLabel 日付不明", monthLabel(null), "日付不明");

// --- DOMParserで生成した文書は不活性であること ---
const scriptedHtml = `<html><head>
<script src="https://www.google.com/recaptcha/enterprise.js?render=DUMMY"></` + `script>
<` + `script>window.__should_not_run = true;</` + `script>
</head><body>
<img src="https://booth.pximg.net/thumb.jpg" alt="商品">
<div id="keep">残る</div>
</body></html>`;
check("インラインscriptは実行されない", window.__should_not_run === undefined, true);
check("scriptや画像が含まれていても本文は読める", parse(scriptedHtml).getElementById("keep").textContent, "残る");

// --- parseDetailPage / parseListPage ---
const detailHtml = `<html><body>
<div class="badge mx-0 align-top order-state paid">支払済み</div>
<div class="summary"><div>商品代金</div><div>¥1,000</div></div>
<div class="summary"><div>お支払金額</div><div>¥1,234</div></div>
</body></html>`;
// ステータスは索引側で読んだものを使うので、詳細ページからは読まない
check("parseDetailPage 支払金額", parseDetailPage(parse(detailHtml)), { amount: 1234, gift: null, items: null, shipping: null });
check("parseDetailPage 金額が無い場合", parseDetailPage(parse("<html><body></body></html>")), { amount: null, gift: null, items: null, shipping: null });

// --- 商品明細とギフト分 ---
// 実ページの構造に合わせる。ショップ名は .sheet-group ではなく、その外側の
// .l-order-detail-by-shop に1つだけ入る(同じショップのダウンロード商品とギフトは
// 別グループだが同じ区切りの中に並ぶ)。
// ダウンロードファイル名の行も .u-tpg-caption1 を使っているので、金額のある行だけを拾う
let itemSeq = 0;
function itemSheet(price, boost, name) {
  const id = ++itemSeq;
  const label = name || `商品${id}`;
  return `<div class="sheet sheet--p400">
    <div class="flex"><div class="flex-[1]">
      <div class="text-14 text-[#505c6b]"><b><a class="nav" href="https://sourflavor.booth.pm/items/${id}">${label}</a></b></div>
      <div class="u-tpg-caption1 text-[#505c6b]">¥ ${price}</div>
      <div class="u-tpg-caption1 text-[#505c6b]"><span class="particulars-heading">BOOST<i class="icon-boost"></i></span>¥ ${boost}</div>
    </div></div>
    <div class="list list--collapse"><div class="legacy-list-item">
      <div class="legacy-list-item__center u-tpg-caption1"><b>${label}.zip</b></div>
    </div></div>
  </div>`;
}
function sheetGroup(title, items) {
  return `<div class="sheet-group sheet-group--outline0">
    <div class="sheet sheet--p400"><div class="l-row flex-[1]">
      <div class="l-col-pc flex items-center"><b class="u-tpg-title3">${title}</b></div>
      <div class="l-col-pc-auto"><a class="btn small calm" href="https://sourflavor.booth.pm/conversations/new">ショップにメッセージを送る</a></div>
    </div></div>
    ${items.map(([p, b, n]) => itemSheet(p, b, n)).join("")}
  </div>`;
}
function shopSection(shop, groups) {
  const host = shop === "SOUR FLAVOR" ? "sourflavor" : "other";
  return `<div class="l-order-detail-by-shop">
    <div class="l-order-detail-sheet-group-header overflow-hidden">
      <b><a class="nav u-tpg-title3" href="https://${host}.booth.pm/">${shop}</a></b>
    </div>
    ${groups}
  </div>`;
}
// 領収書の枠も同じclassを使い回すが、ショップ名の見出しも商品リンクも持たない
const receiptSection = `<div class="l-order-detail-by-shop"><div class="sheet-group sheet-group--outline0">
  <div class="bg-white"><div class="mb-16 font-bold">インボイスとして利用できる領収書</div></div>
</div></div>`;
function orderHtml(total, groups, shop) {
  return `<html><body>
    <span class="mx-0 badge order-state completed">発送完了</span>
    <div class="l-row text-14">
      <div class="l-col-pc-3 text-[#505c6b]">お支払金額</div><div class="l-col-pc-9">¥ ${total}</div>
    </div>
    ${shopSection(shop || "SOUR FLAVOR", groups)}
    ${receiptSection}
  </body></html>`;
}

check("parseYenAmount ラベルと同じ要素にある金額", parseYenAmount("BOOST¥ 0"), 0);
check("parseYenAmount 桁区切り", parseYenAmount("¥ 5,100"), 5100);
check("parseYenAmount 金額が無い", parseYenAmount("ショップにメッセージを送る"), null);

const withGift = orderHtml("5,100",
  sheetGroup("ダウンロード商品", [[425, 0, "髪型A"], [425, 0, "髪型B"]]) +
  sheetGroup("ギフト", [[425, 0, "髪型A"], [425, 100, "髪型B"]]));
const withGiftDetail = parseDetailPage(parse(withGift));
check("ギフトのグループだけを合計する", [withGiftDetail.amount, withGiftDetail.gift], [5100, 950]);

// 商品明細(ショップ名は外側の区切りから、ギフトかどうかはグループの見出しから決まる)
check("商品明細の件数", withGiftDetail.items.length, 4);
check("商品明細の1件目", withGiftDetail.items[0],
  { shop: "SOUR FLAVOR", shopUrl: "https://sourflavor.booth.pm/", name: "髪型A", price: 425, quantity: 1, boost: 0, gift: false });
check("ギフトのグループの商品には印が付く", withGiftDetail.items.map(i => i.gift), [false, false, true, true]);
check("BOOSTは単価と分けて持つ", withGiftDetail.items[3], { shop: "SOUR FLAVOR", shopUrl: "https://sourflavor.booth.pm/", name: "髪型B", price: 425, quantity: 1, boost: 100, gift: true });
check("数量の行が無ければ1個として数える", withGiftDetail.items.every(i => i.quantity === 1), true);
check("ダウンロードのみの注文は送料0", withGiftDetail.shipping, 0);
// ダウンロードファイル名の行も .u-tpg-caption1 だが金額を含まないので単価に混ざらない
check("ファイル名の行を金額と取り違えない", withGiftDetail.items.every(i => i.price === 425), true);
// 領収書の枠は商品リンクを持たないので商品として数えない
check("領収書の枠は商品にしない", withGiftDetail.items.every(i => i.name.startsWith("髪型")), true);

// 商品合計はBOOSTを含む。お支払金額と一致するかはCSVで確認できるようにしてある
check("商品合計はBOOSTを含む", sumItemAmounts(withGiftDetail.items), 1800);
check("お支払金額との差", amountGapOf({ amount: 5100, items: withGiftDetail.items }), 3300);
check("価格を1件でも読めなければ合計は不明", sumItemAmounts([{ price: 100, boost: 0 }, { price: null, boost: 0 }]), null);
check("明細が無ければ合計も差額も不明",
  [sumItemAmounts(null), itemsTotalOf({ amount: 100 }), amountGapOf({ amount: 100 })], [null, null, null]);

const noGift = orderHtml("850", sheetGroup("ダウンロード商品", [[425, 0], [425, 0]]));
check("ギフトが無い注文は0", parseDetailPage(parse(noGift)).gift, 0);

const multiGift = orderHtml("2,000",
  sheetGroup("ギフト", [[500, 0]]) +
  sheetGroup("ダウンロード商品", [[500, 0]]) +
  sheetGroup("ギフト", [[1000, 0]]));
check("ギフトのグループが複数あれば合算する", parseDetailPage(parse(multiGift)).gift, 1500);

// 複数のショップにまたがる注文。ショップ名はそれぞれの区切りから取る
const multiShop = parseDetailPage(parse(`<html><body>
  <div class="l-row"><div class="l-col-pc-3">お支払金額</div><div class="l-col-pc-9">¥ 900</div></div>
  ${shopSection("SOUR FLAVOR", sheetGroup("ダウンロード商品", [[400, 0, "帽子"]]))}
  ${shopSection("べつのショップ", sheetGroup("ダウンロード商品", [[500, 0, "靴"]]))}
</body></html>`));
check("ショップごとに名前が付く", multiShop.items.map(i => [i.shop, i.name]),
  [["SOUR FLAVOR", "帽子"], ["べつのショップ", "靴"]]);

// --- 配送商品(送料あり)の注文 ---
// ダウンロード商品と構造が違う。b.u-tpg-title3 の見出しが無く、代わりに
// 「〇〇から配送」の見出しと発送状況のバッジが入る。見出しの有無で商品のまとまりを
// 判定していたため、配送商品の注文がまるごと「明細なし」になっていた
function shippedGroup(itemName, price, quantity, boost, shippingFee) {
  return `<div class="sheet-group sheet-group--outline0">
    <div class="sheet sheet--p400">
      <div class="badge align-middle mx-0 dispatched">発送済み</div>
      <div class="desktop:flex"><div class="desktop:flex-1">
        <div class="text-16 font-bold">白猫屋から配送</div>
        <div class="text-14 text-text-gray500">自宅から通常配送</div>
      </div></div>
    </div>
    <div class="sheet sheet--p400">
      <div class="flex"><div class="flex-[1]"><div class="desktop:flex"><div class="desktop:flex-1">
        <div class="text-14"><b><a class="nav" href="https://shironekya.booth.pm/items/5606882">${itemName}</a></b></div>
        <div class="u-tpg-caption1 text-[#505c6b]">¥ ${price}</div>
        <div class="u-tpg-caption1 text-[#505c6b]"><span class="particulars-heading">数量</span>${quantity}</div>
        <div class="u-tpg-caption1 text-[#505c6b]"><span class="particulars-heading">BOOST<i class="icon-boost s-1x"></i></span>¥ ${boost}</div>
      </div></div></div></div>
    </div>
    <div class="sheet sheet--p400">
      <div class="text-14 text-right"><span class="particulars-heading">送料</span>¥ ${shippingFee}</div>
    </div>
  </div>`;
}
const shippedHtml = `<html><body>
  <div class="l-row text-14">
    <div class="l-col-pc-3 text-[#505c6b]">お支払金額</div><div class="l-col-pc-9">¥ 4,060</div>
  </div>
  <div class="l-order-detail-by-shop">
    <div class="l-order-detail-sheet-group-header"><b><a class="nav u-tpg-title3" href="https://shironekya.booth.pm/">白猫屋</a></b></div>
    ${shippedGroup("LSM6DSV ジャイロスコープ モジュール", "890", 4, 0, "500")}
  </div>
  ${receiptSection}
</body></html>`;
const shipped = parseDetailPage(parse(shippedHtml));
// 修正前はここが null になり、注文がまるごと未収集として扱われていた
check("配送商品の注文でも明細を読める", Array.isArray(shipped.items), true);
check("配送商品の商品名とショップ名", shipped.items.map(i => [i.shop, i.name]),
  [["白猫屋", "LSM6DSV ジャイロスコープ モジュール"]]);
check("数量を単価と分けて持つ", [shipped.items[0].price, shipped.items[0].quantity], [890, 4]);
check("見出しが無ければギフトにしない", shipped.items[0].gift, false);
check("商品合計は単価×数量", sumItemAmounts(shipped.items), 3560);
check("送料を取り出す", shipped.shipping, 500);
// 890×4 + 送料500 = お支払金額4,060。説明の付かない差額は残らない
check("商品合計と送料でお支払金額を説明しきれる",
  amountGapOf({ amount: shipped.amount, items: shipped.items, shipping: shipped.shipping }), 0);
check("送料は商品合計に混ぜない", shipped.items.length, 1);
// 数量を読めなければ1個と断定せず不明にする(足りない分を黙って減らさない)
const badQuantity = parseDetailPage(parse(shippedHtml.replace(">4<", ">?<")));
check("数量を読めなければ不明", badQuantity.items[0].quantity, null);
check("数量が不明なら商品合計も不明", sumItemAmounts(badQuantity.items), null);
// 見出しの付いた未知の行をBOOSTと決めつけて足さない
const unknownRow = parseDetailPage(parse(shippedHtml.replace(
  '<span class="particulars-heading">BOOST<i class="icon-boost s-1x"></i></span>¥ 0',
  '<span class="particulars-heading">なにか新しい項目</span>¥ 300')));
check("未知の見出しの行は金額に混ぜない", unknownRow.items[0].boost, 0);
check("取りこぼしは差額に出る",
  amountGapOf({ amount: 4060, items: unknownRow.items, shipping: unknownRow.shipping }), 0);

// 構造が変わって商品を1件も見つけられない場合は、0と断定せず不明にする
const noItems = parseDetailPage(parse(`<html><body>
  <div>お支払金額</div><div>¥ 100</div></body></html>`));
check("商品が見つからなければ不明", [noItems.items, noItems.gift], [null, null]);
check("領収書の枠しか無くても不明", parseDetailPage(parse(`<html><body>
  <div>お支払金額</div><div>¥ 100</div>${receiptSection}</body></html>`)).items, null);

// 表示用のギフト表記(0のときは何も出さない)
check("giftText あり", giftText(1500), "ギフト ¥1,500");
check("giftText 0", giftText(0), "");
check("giftAmount 未取得は0扱い", [giftAmount({ amount: 1 }), giftAmount(undefined), giftAmount({ gift: 300 })], [0, 0, 300]);

// --- ポップアップの件数行(取得失敗だけは色を分けるので文面を分けて返す) ---
check("件数行 収集済みのみ",
  summaryCounts({ count: 3, pendingCount: 0, skippedCancelled: 0, failedCount: 0 }),
  { text: "収集済み: 3件", failed: "" });
check("件数行 未収集と除外を添える",
  summaryCounts({ count: 3, pendingCount: 2, skippedCancelled: 1, failedCount: 0 }).text,
  "収集済み: 3件 / 未収集: 2件 / 除外(キャンセル): 1件");
check("件数行 取得失敗は別に返す",
  summaryCounts({ count: 3, pendingCount: 0, skippedCancelled: 0, failedCount: 4 }),
  { text: "収集済み: 3件", failed: " / 取得失敗: 4件" });

const listHtml = `<html><body>
<a class="nav-reverse" href="/orders/1001">
  <img src="https://booth.pximg.net/thumb-1.jpg">
  <div class="badge mx-0 align-top order-state completed">発送完了</div>
  <div class="u-tpg-caption2">注文日時: 2026年5月3日 12:34</div>
</a>
<a class="nav-reverse" href="/orders/1001">
  <div class="badge mx-0 align-top order-state completed">発送完了</div>
  <div class="u-tpg-caption2">注文日時: 2026年5月3日 12:34</div>
</a>
<a class="nav-reverse" href="/orders/1002">
  <div class="badge mx-0 align-top order-state cancelled">キャンセル</div>
  <div class="u-tpg-caption2">注文日時: 2026年4月1日 09:00</div>
</a>
<div class="pager"><a href="/orders?page=2">2</a><a href="/orders?page=7">7</a></div>
</body></html>`;
const list = parseListPage(parse(listHtml));
check("parseListPage 行の抽出(重複行はそのまま返る)", list.orders.map(o => o.id), ["1001", "1001", "1002"]);
check("parseListPage 最大ページ数", list.maxPage, 7);
check("parseListPage ページ送りの有無", list.pagerFound, true);
check("注文IDでの重複除去", new Map(list.orders.map(o => [o.id, o])).size, 2);

// --- ステータスの判定(取り違えるとキャンセルの除外が効かず合計が狂う) ---
function badgeOrderHtml(badgeClass) {
  return `<html><body><a class="nav-reverse" href="/orders/9001">
    <div class="${badgeClass}">状態</div>
    <div class="u-tpg-caption2">注文日時: 2026年5月3日 12:34</div>
  </a></body></html>`;
}
const statusOf = (badgeClass) => parseListPage(parse(badgeOrderHtml(badgeClass))).orders[0].status;
check("見た目のclassが増えても取り違えない", statusOf("badge text-white mx-0 align-top order-state cancelled"), "cancelled");
check("既知のステータスが後ろにあっても拾う", statusOf("order-state rounded shadow-sm completed"), "completed");
check("未知のステータスはそのまま拾って画面に出す", statusOf("badge mx-0 order-state refunded"), "refunded");
check("ステータスらしきclassが無ければ不明", statusOf("badge mx-0 align-top order-state"), "unknown");
check("バッジ自体が無ければ不明", extractStatusFromBadge(null), "unknown");

// --- 一覧を読めていない兆候(読めていないのに「全期間取得済み」と出すと、
//     少ない合計を正しい合計だと思わせてしまう) ---
check("1件も読めなければ読み取り失敗とみなす", listPageLooksUnreadable({ orders: [], maxPage: 1, pagerFound: false }), true);
check("ページ送りがあるのに番号を読めなければ失敗とみなす", listPageLooksUnreadable({ orders: [{}], maxPage: 1, pagerFound: true }), true);
check("ページ送りが無い1ページだけの履歴は正常", listPageLooksUnreadable({ orders: [{}], maxPage: 1, pagerFound: false }), false);
check("複数ページを読めていれば正常", listPageLooksUnreadable({ orders: [{}], maxPage: 7, pagerFound: true }), false);

// --- ここから、索引とキャッシュを差し替えて分割収集の挙動を検証する ---
const INDEX_ORDERS = [
  { id: "a1", status: "completed", date: "2026年5月3日 12:34" },
  { id: "a2", status: "paid", date: "2026年5月20日 09:00" },
  { id: "b1", status: "completed", date: "2026年3月1日 10:00" },
  { id: "c1", status: "completed", date: "2025年12月10日 10:00" },
  { id: "c2", status: "unpaid", date: "2025年12月25日 10:00" },
  { id: "d1", status: "cancelled", date: "2025年11月1日 10:00" },
  { id: "e1", status: "completed", date: "日付なし" },
];
state.index = { updatedAt: "2026-07-26T00:00:00.000Z", orders: INDEX_ORDERS };
const item = (name, price, gift, shop) => ({
  shop: shop || "SOUR FLAVOR",
  shopUrl: `https://${shop === "べつのショップ" ? "other" : "sourflavor"}.booth.pm/`,
  name,
  price,
  boost: 0,
  gift: Boolean(gift),
});
state.cache = {
  a1: {
    v: CACHE_SCHEMA_VERSION,
    amount: 1000, gift: 400, shipping: 0, status: "completed", date: "2026年5月3日 12:34",
    items: [item("髪型A", 600), item("髪型B", 400, true)],
  },
  c1: {
    v: CACHE_SCHEMA_VERSION,
    amount: 3000, gift: 0, shipping: 0, status: "completed", date: "2025年12月10日 10:00",
    items: [item("靴", 3000, false, "べつのショップ")],
  },
  c2: { v: CACHE_SCHEMA_VERSION, amount: null, gift: null, status: "unpaid", date: "2025年12月25日 10:00", items: null }, // 取得失敗
};

check("キャンセルは集計対象から外れる", targetOrders().map(o => o.id), ["a1", "a2", "b1", "c1", "c2", "e1"]);

// 月別の収集状況(新しい月が先、日付不明は末尾)
const stats = buildMonthStats(targetOrders(), state.cache);
check("月別の並び", stats.map(s => s.label), ["2026年5月", "2026年3月", "2025年12月", "日付不明"]);
check("2026年5月の注文数/収集済み/未収集", [stats[0].count, stats[0].collected, stats[0].pending], [2, 1, 1]);
check("2026年3月は全て未収集", [stats[1].count, stats[1].collected, stats[1].pending], [1, 0, 1]);
// 取得失敗は再取得の対象なので未収集として数える(pendingTargets と数え方をそろえる)
check("2025年12月は取得失敗を未収集として数える", [stats[2].count, stats[2].collected, stats[2].pending], [2, 1, 1]);
check("日付不明の集計", [stats[3].key, stats[3].count, stats[3].pending], [null, 1, 1]);

// 範囲指定(両端を含む・日付不明は入らない)
check("範囲指定 単月", ordersInRange("2026-05", "2026-05").map(o => o.id), ["a1", "a2"]);
check("範囲指定 複数月にまたがる", ordersInRange("2026-03", "2026-05").map(o => o.id), ["a1", "a2", "b1"]);
check("範囲指定 年をまたぐ", ordersInRange("2025-12", "2026-03").map(o => o.id), ["b1", "c1", "c2"]);
check("範囲指定 開始と終了が逆でも同じ", ordersInRange("2026-05", "2026-03").map(o => o.id), ["a1", "a2", "b1"]);
check("範囲指定 該当なし", ordersInRange("2024-01", "2024-12").map(o => o.id), []);
check("範囲指定にキャンセルは含まれない", ordersInRange("2025-11", "2025-11").map(o => o.id), []);

// キャッシュの扱い
check("通常は未収集のみが対象", pendingTargets(ordersInRange("2026-05", "2026-05"), false).map(o => o.id), ["a2"]);
check("強制再取得では収集済みも対象", pendingTargets(ordersInRange("2026-05", "2026-05"), true).map(o => o.id), ["a1", "a2"]);
// 取得失敗をそのままにすると強制再取得でしか直せないので、既定で拾い直す
check("取得失敗は次の実行で自動的に再取得される", pendingTargets(ordersInRange("2025-12", "2025-12"), false).map(o => o.id), ["c2"]);
// 商品明細を読めなかった注文も、次の実行で拾い直せるよう対象に含める
const collectedEntry = (amount) => ({ v: CACHE_SCHEMA_VERSION, amount, items: [item("何か", amount)] });
check("needsCollect 未収集・取得失敗・明細なしが対象",
  [needsCollect(undefined), needsCollect({ amount: null, items: null }), needsCollect({ amount: 500 }), needsCollect(collectedEntry(0)), needsCollect(collectedEntry(500))],
  [true, true, true, false, false]);

// --- キャッシュの版数(保存済みデータから欠落を推測せず、何を保存したかを記録する) ---
//
// v0.15.0は配送商品のグループを読み飛ばしていたため、1つの注文にダウンロード商品と
// 配送商品が混在していると、ダウンロード側だけがitemsに入り、配送側の商品と送料が
// 欠けたまま「収集済み」として残っていた。
// このエントリは「ダウンロードのみの正しい注文」と保存された形がまったく同じで、
// データを見て区別することはできない
const oldEntry = { amount: 1000, gift: 0, items: [item("髪型A", 1000)] }; // v0.15.0以前
const newEntry = { ...oldEntry, v: CACHE_SCHEMA_VERSION, shipping: 0 };
check("版数の無いエントリは最古として扱う", entrySchemaVersion(oldEntry), 0);
check("版数を持つエントリはその版", entrySchemaVersion(newEntry), CACHE_SCHEMA_VERSION);
check("版数が無ければ取り直す", [isOutdatedEntry(oldEntry), needsCollect(oldEntry)], [true, true]);
check("現行版なら取り直さない", [isOutdatedEntry(newEntry), needsCollect(newEntry)], [false, false]);
// バックアップの復元で、この環境より新しい版のデータが入ってくることがある
check("新しい版は取り直さない", isOutdatedEntry({ ...newEntry, v: CACHE_SCHEMA_VERSION + 1 }), false);
// 混在注文の欠落は差額に出るが、差額はクーポン利用でも出るので判定材料にはしない
check("欠落したエントリの差額は0にならない",
  amountGapOf({ amount: 4060, items: [item("髪型A", 500)] }), 3560);

// 表示用の一覧(未収集と取得失敗を区別する)
const results = buildResults();
check("未収集はundefined", results.find(r => r.id === "a2").amount, undefined);
check("取得失敗はnull", results.find(r => r.id === "c2").amount, null);
check("収集済みは数値", results.find(r => r.id === "a1").amount, 1000);

// --- 支出推移・前年比較の集計 ---
const trend = buildSpendingTrend([
  { amount: 100, date: "2026年1月5日" },
  { amount: 250, date: "2026年3月5日" },
  { amount: 80, date: "2025年1月5日" },
  { amount: 120, date: "2025年2月5日" },
  { amount: null, date: "2026年2月5日" },
  { amount: 999, date: "日付なし" },
], 2026, 3);
check("支出推移は今年と前年だけを月別に集計", trend.months.slice(0, 3).map(m => [m.current, m.previous]),
  [[100, 80], [0, 120], [250, 0]]);
check("支出推移の年間累計", trend.months.slice(0, 3).map(m => [m.currentCumulative, m.previousCumulative]),
  [[100, 80], [100, 200], [350, 200]]);
check("前年同期間との差と比率", [trend.currentToDate, trend.previousToDate, trend.difference, trend.rate],
  [350, 200, 150, 75]);
check("月別グラフの最大値", trend.maxMonthly, 250);
check("累計グラフの最大値", trend.maxCumulative, 350);
check("前年同期が0円なら比率を出さない", buildSpendingTrend([
  { amount: 100, date: "2026年1月5日" },
], 2026, 1).rate, null);

// --- 描画 ---
render();
check("合計は収集済みのみ", document.getElementById("totalAmount").textContent, "¥4,000");
check("合計のギフト表記", document.getElementById("totalGift").textContent, "ギフト ¥400");
check("収集済み件数", document.getElementById("totalCount").textContent, "収集済み: 2件");
check("未収集件数", document.getElementById("pendingCount").textContent, "未収集: 3件");
check("除外と取得失敗", document.getElementById("skippedCount").textContent, "除外(キャンセル): 1件 / 金額取得失敗: 1件");
check("索引の状態表示", indexStatus.textContent.includes("注文数: 6件"), true);

// 月別テーブルは年でまとめ、月は折りたたんだ状態で始まる
const yearStats = buildYearStats(targetOrders(), state.cache);
check("年のまとめ順", yearStats.map(y => y.label), ["2026年", "2025年", "日付不明"]);
check("2026年の合算", [yearStats[0].count, yearStats[0].collected, yearStats[0].pending], [3, 1, 2]);
check("年の中の月は新しい順", yearStats[0].months.map(m => m.key), ["2026-05", "2026-03"]);

const monthYearRows = [...monthTableBody.querySelectorAll("tr.year-row")];
const monthSubRows = [...monthTableBody.querySelectorAll("tr.month-row")];
check("年の行数", monthYearRows.length, 2);
check("月の行数", monthSubRows.length, 3);
check("月は初期状態で畳まれている", monthSubRows.every(r => r.hidden), true);
check("未収集がある年は強調", monthYearRows[0].classList.contains("has-pending"), true);
// 2025年は c2 が取得失敗。取得失敗は再取得の対象なのでこの年も強調される
check("取得失敗の残る年も強調", monthYearRows[1].classList.contains("has-pending"), true);
check("日付不明は独立した行", [...monthTableBody.querySelectorAll("tr.unknown-row")].length, 1);
check("範囲の選択肢は日付不明を除く", [...rangeFrom.options].map(o => o.value), ["2026-05", "2026-03", "2025-12"]);
check("初期選択は未収集のある最新月", [rangeFrom.value, rangeTo.value], ["2026-05", "2026-05"]);

// ▸ をクリックすると月別が開閉する
monthYearRows[0].querySelector(".toggle").click();
check("年の▸で展開", [...monthTableBody.querySelectorAll('tr.month-row[data-year-key="2026"]')].every(r => !r.hidden), true);
check("他の年は畳まれたまま", [...monthTableBody.querySelectorAll('tr.month-row[data-year-key="2025"]')].every(r => r.hidden), true);
check("展開しても範囲は変わらない", [rangeFrom.value, rangeTo.value], ["2026-05", "2026-05"]);

// 年の行(▸以外)をクリックするとその年全体が範囲になる
monthYearRows[0].click();
check("年クリックでその年が範囲", [rangeFrom.value, rangeTo.value], ["2026-03", "2026-05"]);
check("年の行が強調される", [monthYearRows[0].classList.contains("in-range"), monthYearRows[1].classList.contains("in-range")], [true, false]);

// 月の行をクリックするとその月だけが範囲になる
const may = monthTableBody.querySelector('tr.month-row[data-month-key="2026-05"]');
may.click();
check("月クリックで単月が範囲", [rangeFrom.value, rangeTo.value], ["2026-05", "2026-05"]);
check("範囲外の年は強調されない", monthYearRows[0].classList.contains("in-range"), false);
check("選択された月だけ強調される", monthSubRows.map(r => r.classList.contains("in-range")), [true, false, false]);

// 日付不明の行はクリックしても範囲を変えない
monthTableBody.querySelector("tr.unknown-row").click();
check("日付不明の行は範囲に入らない", [rangeFrom.value, rangeTo.value], ["2026-05", "2026-05"]);
check("日付不明の案内が出る", unknownArea.hidden, false);
check("日付不明は一括集計へ誘導する", unknownCount.textContent.includes("まとめて一括集計"), true);

// 再描画しても開閉状態が保たれる
render();
check("再描画で展開状態が保たれる", [...monthTableBody.querySelectorAll('tr.month-row[data-year-key="2026"]')].every(r => !r.hidden), true);

// すべて収集済みの年は強調しない(c2をいったん収集済みにして確かめ、元へ戻す)
const failedC2 = state.cache.c2;
state.cache.c2 = { ...failedC2, amount: 500, gift: 0, items: [item("何か", 500)] };
render();
check("未収集が無い年は強調しない",
  [...monthTableBody.querySelectorAll("tr.year-row")][1].classList.contains("has-pending"), false);
setRange("2025-12", "2025-12");
check("すべて収集済みなら予定なし", plannedCount.textContent, "取得予定: なし(収集済み)");
check("予定が0ならボタンを押せない", collectRangeBtn.disabled, true);
state.cache.c2 = failedC2;
render();
setRange("2026-05", "2026-05"); // 以降の検証のため元の範囲へ戻す

// 取得予定件数(ボタン横の表示)
check("取得予定件数 未収集のみ", plannedCount.textContent, "取得予定: 1件");
check("取得予定が0でなければボタンは押せる", collectRangeBtn.disabled, false);
setRange("2026-05", "2026-05");
check("取得予定件数 収集済みを含む月", plannedCount.textContent, "取得予定: 1件");
forceRefreshRange.checked = true;
forceRefreshRange.dispatchEvent(new Event("change"));
check("強制再取得では収集済みも予定に入る", plannedCount.textContent, "取得予定: 2件");
forceRefreshRange.checked = false;
setRange("2025-12", "2025-12");
check("取得失敗の残る月は予定に入る", plannedCount.textContent, "取得予定: 1件");

// 未収集のある範囲をまとめて選択(取得失敗の残る月も未収集として拾う)
selectPendingBtn.click();
check("未収集のある範囲を選択", [rangeFrom.value, rangeTo.value], ["2025-12", "2026-05"]);
check("範囲選択で予定件数も更新される", plannedCount.textContent, "取得予定: 3件");

// 年別・月別の集計(収集済みのみ)
const yearRows = [...periodTableBody.querySelectorAll(".year-row")];
check("年行の数", yearRows.length, 2);
// 金額との間隔はCSSのマージンなので、テキスト上は連結される
check("2026年の収集済み合計", [...yearRows[0].cells].map(c => c.textContent.trim()), ["▸ 2026年", "1件", "ギフト ¥400¥1,000"]);
check("ギフトは金額の左に置く", yearRows[0].cells[2].firstElementChild.className, "gift");
check("2025年はギフト情報が無いので出さない", [...yearRows[1].cells].map(c => c.textContent.trim()), ["▸ 2025年", "1件", "¥3,000"]);
check("初期状態で月行は畳まれている", [...periodTableBody.querySelectorAll(".month-row")].every(r => r.hidden), true);
yearRows[0].querySelector(".toggle").click();
check("年行クリックで展開", [...periodTableBody.querySelectorAll('.month-row[data-year-key="2026"]')].every(r => !r.hidden), true);

// 支出推移画面でも同じ年別・月別の集計部品を使う
renderSpendingTrends(new Date(2026, 11, 1));
check("支出推移は収集済みデータがあれば表示", [trendsEmpty.hidden, trendsArea.hidden], [true, false]);
check("支出推移の要約", [...trendSummary.querySelectorAll(".stat-value")].map(e => e.textContent),
  ["¥1,000", "¥3,000", "-¥2,000"]);
check("月別比較は12か月分", monthlyTrendChart.querySelectorAll(".trend-month").length, 12);
check("月別比較の棒は今年と前年", monthlyTrendChart.querySelectorAll(".trend-bar").length, 24);
check("累計グラフは2本", cumulativeTrendChart.querySelectorAll("polyline").length, 2);
check("今年の累計線は対象月まで", cumulativeTrendChart.querySelector("polyline.current").getAttribute("points").split(" ").length, 12);
check("支出推移にも同じ年別集計", [...trendPeriodTableBody.querySelectorAll(".year-row")].map(row => [row.cells[1].textContent, row.cells[2].textContent]),
  [...periodTableBody.querySelectorAll(".year-row")].map(row => [row.cells[1].textContent, row.cells[2].textContent]));
const trendYearRow = trendPeriodTableBody.querySelector('.year-row[data-year-key="2026"]');
trendYearRow.click();
check("支出推移の年別表も月を開閉できる",
  [...trendPeriodTableBody.querySelectorAll('.month-row[data-year-key="2026"]')].every(row => !row.hidden), true);
check("別画面の表の開閉状態は独立", [...periodTableBody.querySelectorAll('.month-row[data-year-key="2026"]')].every(row => !row.hidden), true);

// 比較する2つの年を選べる(2年前と見比べたいことがある)
check("既定は今年と前年", [trendYear.value, trendBaseYear.value], ["2026", "2025"]);
check("選べるのは注文のある年だけ", [...trendYear.options].map(o => o.value), ["2026", "2025"]);
// 同じ年どうしを比べると比較対象が空になり、差が全額になってしまう
check("選んでいる年は相手側から外す", [...trendBaseYear.options].map(o => o.value), ["2025"]);
setTrendYears(2025, 2026);
check("入れ替えると要約も入れ替わる", [...trendSummary.querySelectorAll(".stat-value")].map(e => e.textContent),
  ["¥3,000", "¥1,000", "+¥2,000"]);
check("過ぎた年は12月まで見る", trendCurrentYearLabel.textContent, "2025年");
setTrendYears(2026, 2025);
// 集計そのものも任意の年を比べられる
check("比較年を渡せる", buildSpendingTrend([
  { id: "x", date: "2026年1月1日 00:00", amount: 100 },
  { id: "y", date: "2024年1月1日 00:00", amount: 400 },
], 2026, 12, 2024).difference, -300);

// 注文ごとの内訳
const orderRows = [...orderTableBody.querySelectorAll("tr")];
check("内訳は日付の降順(日付不明は末尾)", orderRows.map(tr => tr.cells[3].textContent), ["a2", "a1", "b1", "c2", "c1", "e1"]);
check("未収集の表示", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[2].textContent, "未収集");
check("内訳のギフト併記", orderRows.find(tr => tr.cells[3].textContent === "a1").cells[2].textContent, "ギフト ¥400¥1,000");
check("ギフトが無い注文は金額のみ", orderRows.find(tr => tr.cells[3].textContent === "c1").cells[2].textContent, "¥3,000");
check("取得失敗の表示", orderRows.find(tr => tr.cells[3].textContent === "c2").cells[2].textContent, "取得失敗");
check("ステータス日本語化", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[1].textContent, "支払済み");

// 金額は読めたが商品明細を読めなかった注文。月別表では未収集として数えているので、
// 内訳でも黙って収集済みには見せない
state.cache.b1 = { amount: 700, gift: 0, status: "completed", date: "2026年3月1日 10:00", items: null };
render();
check("明細を読めなかった注文は内訳で分かる",
  [...orderTableBody.querySelectorAll("tr")].find(tr => tr.cells[3].textContent === "b1").cells[2].textContent,
  "明細なし¥700");
check("明細なしは未収集として数える", buildMonthStats(targetOrders(), state.cache).find(s => s.key === "2026-03").pending, 1);
delete state.cache.b1;
render();

// 以前の版で保存された注文。混在注文では配送側の商品と送料が欠けているが、
// 保存された形からは区別できないので、版数を見て取り直す
state.cache.b1 = { amount: 700, gift: 0, status: "completed", date: "2026年3月1日 10:00", items: [item("何か", 700)] };
render();
check("以前の版の注文は内訳で分かる",
  [...orderTableBody.querySelectorAll("tr")].find(tr => tr.cells[3].textContent === "b1").cells[2].textContent,
  "要再取得¥700");
check("以前の版は未収集として数える", buildMonthStats(targetOrders(), state.cache).find(s => s.key === "2026-03").pending, 1);
check("以前の版は取得予定に入る", pendingTargets(ordersInRange("2026-03", "2026-03"), false).map(o => o.id), ["b1"]);
// 何も操作していないのに未収集が増えたように見えると、不具合と区別が付かない
check("取り直す理由を画面に出す", outdatedArea.hidden, false);
check("取り直す件数と理由", outdatedCount.textContent.includes("以前の版で収集した1件を取り直します"), true);
check("金額の集計は変わらないと伝える", outdatedCount.textContent.includes("金額の集計は今のまま"), true);
delete state.cache.b1;
render();
check("現行版だけなら案内を出さない", outdatedArea.hidden, true);

// --- 推し作者ランキング ---
// ショップ別の金額だけは注文単位のお支払金額を使えない。1つの注文が複数ショップに
// またがると割り振れないため、商品の合計で集計する(送料やクーポンは入らない)
const shopRows = aggregateByShop(buildResults());
check("ショップ別は金額の多い順", shopRows.map(s => s.name), ["べつのショップ", "SOUR FLAVOR"]);
check("ショップ別の商品数と金額", [shopRows[1].count, shopRows[1].total], [2, 1000]);
check("ギフトを分けて数える", [shopRows[1].giftCount, shopRows[1].gift], [1, 400]);
// 表示名は変わりうるので、同じショップかどうかはURLで判断する
check("同じショップはURLでまとめる", shopRows[1].key, "https://sourflavor.booth.pm/");
check("明細の無い注文は入らない", shopRows.reduce((n, s) => n + s.orders, 0), 2);
check("同じショップは複数の注文をまとめる",
  aggregateByShop([{ id: "o1", items: [item("A", 100)] }, { id: "o2", items: [item("B", 200)] }])[0],
  { key: "https://sourflavor.booth.pm/", name: "SOUR FLAVOR", url: "https://sourflavor.booth.pm/", count: 2, giftCount: 0, total: 300, gift: 0, unknown: 0, orders: 2, items: ["A", "B"] });
// 同じ商品を複数の注文で買っても、開いたときに同じ名前が並ばないようにする
check("商品名は重複を除いて名前順に並べる",
  aggregateByShop([{ id: "o1", items: [item("ぼうし", 100), item("あうたー", 100)] }, { id: "o2", items: [item("ぼうし", 100)] }])[0].items,
  ["あうたー", "ぼうし"]);
check("数量ぶん商品数と金額を数える",
  aggregateByShop([{ id: "o1", items: [{ ...item("A", 890), quantity: 4 }] }]).map(s => [s.count, s.total])[0], [4, 3560]);
// 読めなかった分を0として足すと、少ない額を正しい合計に見せてしまう
const unknownShop = aggregateByShop([{ id: "o1", items: [item("A", 100), { ...item("B", 0), price: null }] }])[0];
check("金額を読めない商品は合計に足さない", [unknownShop.total, unknownShop.unknown, unknownShop.count], [100, 1, 2]);

// 表示(ギフトは金額・商品数のどちらも左に小さく添える)
render();
const shopRowEls = [...rankingTableBody.querySelectorAll("tr.shop-row")];
check("ランキングの行数", shopRowEls.length, 2);
check("ショップ名はリンクにする", shopRowEls[1].cells[1].querySelector("a").getAttribute("href"), "https://sourflavor.booth.pm/");
check("商品数のギフト併記", shopRowEls[1].cells[2].textContent, "ギフト 1点2点");
check("金額のギフト併記", shopRowEls[1].cells[3].textContent, "ギフト ¥400¥1,000");
check("ギフトが無い行は併記しない", shopRowEls[0].cells[2].textContent, "1点");

// 順位の装飾と表示件数
const savedRankIndex = state.index;
const savedRankCache = state.cache;
state.index = {
  updatedAt: "x", complete: true,
  orders: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, status: "completed", date: "2026年5月1日 00:00" })),
};
state.cache = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`r${i}`, {
  v: CACHE_SCHEMA_VERSION, amount: (12 - i) * 100, gift: 0, shipping: 0,
  status: "completed", date: "2026年5月1日 00:00",
  items: [{ shop: `ショップ${i}`, shopUrl: `https://shop${i}.booth.pm/`, name: "商品", price: (12 - i) * 100, quantity: 1, boost: 0, gift: false }],
}]));
render();
const rankRows = [...rankingTableBody.querySelectorAll("tr.shop-row")];
check("上位10位まで表示する", rankRows.length, 10);
check("順位は金額の多い順", rankRows.map(tr => tr.cells[0].querySelector(".rank-badge").textContent), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
check("1〜3位に金・銀・銅の王冠を敷く",
  rankRows.slice(0, 4).map(tr => tr.cells[0].querySelector(".rank-badge").className),
  ["rank-badge rank-crown-1", "rank-badge rank-crown-2", "rank-badge rank-crown-3", "rank-badge"]);
check("5位までを太字にする", rankRows.map(tr => tr.classList.contains("rank-top")),
  [true, true, true, true, true, false, false, false, false, false]);
check("表示しきれない件数を知らせる", rankingStats.textContent, "ショップ: 12件 (上位10件を表示)");
state.index = savedRankIndex;
state.cache = savedRankCache;
render();
check("全部表示できるときは件数だけ出す", rankingStats.textContent, "ショップ: 2件");

// 順位をクリックすると、そのショップで買った商品が下に開く
const firstShopKey = [...rankingTableBody.querySelectorAll("tr.shop-row")][0].dataset.shopKey;
const firstItemsRow = () => rankingTableBody.querySelector(`tr.shop-items-row[data-shop-key="${CSS.escape(firstShopKey)}"]`);
check("商品の行は最初は閉じている", firstItemsRow().hidden, true);
toggleShopItems(firstShopKey);
check("順位を押すと商品が開く", firstItemsRow().hidden, false);
check("開いたことを三角で示す",
  rankingTableBody.querySelector("tr.shop-row .toggle").textContent, "▾");
check("商品名を並べる", [...firstItemsRow().querySelectorAll("li")].map(li => li.textContent).length > 0, true);
// 並べ替えても開いたままにする(閉じると探し直しになる)
setRankingSort("count");
check("並べ替えても開いたまま", firstItemsRow().hidden, false);
setRankingSort("amount");
toggleShopItems(firstShopKey);
check("もう一度押すと閉じる", firstItemsRow().hidden, true);

// --- ランキングの基準の切り替え(金額編・購入数編) ---
// 少額をたくさん買ったショップと、高額を1点だけのショップでは1位が入れ替わる
check("購入数編は点数の多い順", aggregateByShop(buildResults(), "count").map(s => s.name), ["SOUR FLAVOR", "べつのショップ"]);
check("金額編は点数によらず金額の多い順", aggregateByShop(buildResults(), "amount").map(s => s.name), ["べつのショップ", "SOUR FLAVOR"]);
check("基準を渡さなければ金額編", aggregateByShop(buildResults()).map(s => s.name), aggregateByShop(buildResults(), "amount").map(s => s.name));
check("知らない基準でも金額編に落とす", aggregateByShop(buildResults(), "unknown").map(s => s.name), ["べつのショップ", "SOUR FLAVOR"]);
// 同点のときにもう一方で決めないと、再描画のたびに順位が入れ替わって見える
const tiedRows = [{ id: "t1", items: [item("A", 100), item("B", 100), item("C", 500, false, "べつのショップ"), item("D", 100, false, "べつのショップ")] }];
check("購入数編の同点は金額の多い順", aggregateByShop(tiedRows, "count").map(s => s.name), ["べつのショップ", "SOUR FLAVOR"]);

// 切り替えは表の並びと、押されているボタン・並べ替えに使っている列の印に効く
setRankingSort("count");
check("購入数編に切り替えると表も入れ替わる",
  [...rankingTableBody.querySelectorAll("tr.shop-row")].map(tr => tr.cells[1].textContent),
  ["SOUR FLAVOR", "べつのショップ"]);
check("押されている基準が分かる",
  [...rankingSortToggle.querySelectorAll(".segmented-btn")].map(b => b.getAttribute("aria-pressed")),
  ["false", "true"]);
check("並べ替えに使っている列に印を付ける",
  [...rankingTableBody.closest("table").querySelectorAll("th.sorted")].map(th => th.dataset.sort),
  ["count"]);

// --- ランキングの共有 ---
// 共有するのは画面に出ている並びそのもの。文面のために集計し直さない
check("共有は購入数編の並びと点数を出す", buildRankingShareText(rankingShareStats, false),
  "BOOTHの推し作者ランキング🛍️（購入数編）\n\n🥇 SOUR FLAVOR 2点\n🥈 べつのショップ 1点\n\n#BOOTHお買いものレポート");
check("購入数編の共有はチェックで点数を落とす", buildRankingShareText(rankingShareStats, true),
  "BOOTHの推し作者ランキング🛍️（購入数編）\n\n🥇 SOUR FLAVOR\n🥈 べつのショップ\n\n#BOOTHお買いものレポート");
setRankingSort("amount");
// 金額編の金額は商品の合計で、送料やクーポンが入らない。画面と同じ断りを文面にも付ける
check("金額編の共有は金額と断り書きを出す", buildRankingShareText(rankingShareStats, false),
  "BOOTHの推し作者ランキング🛍️（金額編）\n\n🥇 べつのショップ ¥3,000\n🥈 SOUR FLAVOR ¥1,000\n\n※金額は商品の合計（送料・クーポンを除く）\n\n#BOOTHお買いものレポート");
// 金額を出さないなら、その金額についての断り書きも要らない
check("金額を落とせば断り書きも出さない", buildRankingShareText(rankingShareStats, true),
  "BOOTHの推し作者ランキング🛍️（金額編）\n\n🥇 べつのショップ\n🥈 SOUR FLAVOR\n\n#BOOTHお買いものレポート");
check("共有は上位5件までにする",
  buildRankingShareText({ sort: "count", rows: Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, count: 1, total: 0 })) }, true).split("\n").slice(2, 7),
  ["🥇 S0", "🥈 S1", "🥉 S2", "4. S3", "5. S4"]);

// 順位がずれうる理由。1つでもあれば共有の前に確認する
const rankShareBase = { sort: "amount", rows: [{ name: "A", count: 1, total: 100 }], pending: 0, unknown: 0, indexComplete: true };
check("共有 揃っていれば確認しない", rankingShareIssues(rankShareBase), []);
check("共有 未収集があれば断る", rankingShareIssues({ ...rankShareBase, pending: 3 }), ["未収集の注文が3件あります"]);
check("共有 索引が未完了なら断る", rankingShareIssues({ ...rankShareBase, indexComplete: false }), ["注文履歴の取得が途中で終わっています"]);
check("共有 金額を読めない商品があれば断る", rankingShareIssues({ ...rankShareBase, unknown: 2 }), ["金額を読み取れなかった商品が2点あります"]);
// 読めなかった商品も点数には入っているので、購入数編の順位はずれない
check("共有 購入数編は金額不明を理由にしない", rankingShareIssues({ ...rankShareBase, sort: "count", unknown: 2 }), []);
check("共有の確認文面", rankingShareConfirmMessage({ ...rankShareBase, pending: 1, indexComplete: false }),
  "未収集の注文が1件あります。注文履歴の取得が途中で終わっています。\nこのまま共有すると、順位や数字が実際とは違うことがあります。\nよろしいですか?");

// 共有ボタンはランキングを開いている間だけランキングを共有する
location.hash = "#/ranking";
renderCurrentView();
check("ランキングでは共有の対象が変わる", [shareBtn.textContent, shareBtn.disabled], ["𝕏でランキングを共有", false]);
location.hash = "#/report";
renderCurrentView();
check("他の画面では合計の共有に戻る", shareBtn.textContent, "𝕏で共有");

// --- 今年のまとめ ---
// 「はじめて出会った作者」を出すため、その年より前の注文も見る必要がある
const summaryRows = [
  { id: "s1", date: "2024年5月1日 00:00", amount: 1000, gift: 0,
    items: [item("旧作", 1000)] },
  { id: "s2", date: "2026年2月1日 00:00", amount: 3300, gift: 0,
    items: [{ ...item("服", 1000), quantity: 3, boost: 300 }] },
  { id: "s3", date: "2026年3月1日 00:00", amount: 500, gift: 500,
    items: [item("ギフト", 500, true, "べつのショップ")] },
  { id: "s4", date: "2026年3月2日 00:00", amount: null, gift: 0, items: null },
];
const yearSummary = buildYearSummary(summaryRows, 2026);
check("その年の支払いだけを合計する", [yearSummary.total, yearSummary.orderCount], [3800, 2]);
// 未収集を黙って落とすと、実際より少ない額を「その年の全部」として見せてしまう
check("未収集の件数を持つ", yearSummary.pendingCount, 1);
check("ギフト額はその年の分だけ", yearSummary.gift, 500);
check("点数は数量ぶん数える", [yearSummary.itemCount, yearSummary.giftItemCount], [4, 1]);
check("支援した作者の数", yearSummary.shopCount, 2);
// 2024年にも買っている SOUR FLAVOR は「はじめて」に入らない
check("その年にはじめて買った作者だけ数える", yearSummary.newShopCount, 1);
check("BOOSTの上乗せを合計する", [yearSummary.boost, yearSummary.boostItemCount], [300, 1]);
check("いちばん買った月", [yearSummary.busiestMonth.key, yearSummary.busiestMonth.total], ["2026-02", 3300]);
check("この年の推し作者は3件まで", yearSummary.topShops.map(s => s.name), ["SOUR FLAVOR", "べつのショップ"]);
// 0円のBOOSTは「応援した」と数えない(金額の行自体は常にあるため)
check("0円のBOOSTは数えない",
  buildYearSummary([{ id: "z", date: "2026年1月1日 00:00", amount: 100, items: [item("A", 100)] }], 2026).boostItemCount, 0);
// 過去の注文が未収集だと明細が無く、その作者を「はじめて」に数えてしまう
check("過去の未収集は件数として返す",
  buildYearSummary([{ id: "p", date: "2024年1月1日 00:00", amount: null, items: null }, summaryRows[1]], 2026).beforePending, 1);
check("注文のある年を新しい順に返す", orderYears(summaryRows), [2026, 2024]);

// 表示(年を選べる。カードはBOOSTの有無で数が変わる)
const savedSummaryIndex = state.index;
const savedSummaryCache = state.cache;
state.index = { updatedAt: "x", complete: true, orders: summaryRows.map(r => ({ id: r.id, status: "completed", date: r.date })) };
state.cache = Object.fromEntries(summaryRows.map(r => [r.id, { ...r, v: CACHE_SCHEMA_VERSION, status: "completed", shipping: 0 }]));
setSummaryYear(2026);
render();
check("年のプルダウンは注文のある年だけ", [...summaryYear.options].map(o => o.value), ["2026", "2024"]);
check("カードの見出し", [...summaryCards.querySelectorAll(".stat-label")].map(e => e.textContent),
  ["2026年の合計額", "買ったもの", "支援した作者", "いちばん買った月"]);
check("カードの数字", [...summaryCards.querySelectorAll(".stat-value")].map(e => e.textContent),
  ["¥3,800", "4点", "2人", "2026年2月"]);
check("合計には未収集の件数を添える",
  summaryCards.querySelector(".stat-note").textContent, "注文2件 / ギフト ¥500 / 未収集1件");
check("この年の推し作者を並べる",
  [...summaryTopShopsBody.querySelectorAll("tr.shop-row")].map(tr => tr.cells[1].textContent), ["SOUR FLAVOR", "べつのショップ"]);
check("過去に未収集が無ければ断らない", summaryNewShopWarn.hidden, true);

// まとめの共有(ボタンには年が入る。何年分が出るのか押す前に分かる必要がある)
location.hash = "#/summary";
renderCurrentView();
check("まとめでは年入りの共有ボタンになる", [shareBtn.textContent, shareBtn.disabled], ["𝕏で2026年のまとめを共有", false]);
check("まとめの共有文面", buildSummaryShareText(summaryShareStats),
  "2026年のBOOTHお買いもの🛍️\n\n合計額 ¥3,800（2件）\n買ったもの 4点\n支援した作者 2人\nうちはじめて 1人\nいちばん買った月 2026年2月\n\n推し作者\n🥇 SOUR FLAVOR\n🥈 べつのショップ\n\n#BOOTHお買いものレポート");
// 未収集があると数字がずれるので、出す前に断る
check("まとめの共有 未収集を断る", summaryShareIssues(summaryShareStats), ["2026年に未収集の注文が1件あります"]);
check("まとめの共有 揃っていれば断らない",
  summaryShareIssues({ ...summaryShareStats, pendingCount: 0, beforePending: 0 }), []);
// 「はじめて」が0人なら、過去が未収集でもずれようがない
check("まとめの共有 はじめてが0人なら過去の未収集を断らない",
  summaryShareIssues({ ...summaryShareStats, pendingCount: 0, beforePending: 3, newShopCount: 0 }), []);
location.hash = "#/report";
renderCurrentView();
// BOOSTを使っていない年に空の数字を並べない
setSummaryYear(2024);
check("BOOSTが無ければカードごと出さない",
  [...summaryCards.querySelectorAll(".stat-label")].map(e => e.textContent).includes("BOOSTの上乗せ"), false);
setSummaryYear(2026);
state.index = savedSummaryIndex;
state.cache = savedSummaryCache;
render();

// --- 共有ウィンドウを開く ---
// noopener を第3引数に渡すと、タブが開けても戻り値は必ず null になる(仕様)。
// それを「止められた」と読むと、正常に開いているのに毎回押し直しを案内してしまう
const realOpen = window.open;
function openShareWith(returned) {
  const calls = [];
  window.open = (...args) => { calls.push(args); return returned; };
  clearNotice();
  try {
    openShareWindow("テスト文面");
  } finally {
    window.open = realOpen;
  }
  return calls;
}
const openedCalls = openShareWith({ opener: {} });
check("共有はXの投稿画面を新しいタブで開く",
  [openedCalls.length, openedCalls[0][0].startsWith("https://x.com/intent/post?text="), openedCalls[0][1]],
  [1, true, "_blank"]);
check("開けたときは押し直しを案内しない", noticeBox.hidden, true);
// 戻り値を使う代わりに opener を切る。共有先からこのページを触らせないため
const openedWindow = { opener: {} };
openShareWith(openedWindow);
check("開いたタブの opener は切る", openedWindow.opener, null);
// 本当に止められたときだけ案内する。
// 押す先のボタンは画面によって文言が変わるので、そのまま引用する
location.hash = "#/ranking";
renderCurrentView();
openShareWith(null);
check("止められたときは押し直しを案内する",
  noticeBox.textContent.includes("もう一度「𝕏でランキングを共有」を押してください"), true);
location.hash = "#/report";
renderCurrentView();
clearNotice();

// --- 共有カード ---
// カードは文面と同じ集計値から組む。組み直すと本文と画像で数字が食い違う
// state はこの時点で元に戻っているので、まとめの集計は作り直して渡す
const summaryShareCard = buildSummaryShareCard(buildYearSummary(summaryRows, 2026));
check("まとめのカードの見出し", [summaryShareCard.title, summaryShareCard.subtitle],
  ["2026年のお買いもの", "BOOTHお買いものレポート"]);
check("まとめのカードの数字", summaryShareCard.stats.map(s => [s.label, s.value]),
  [["合計額", "¥3,800"], ["買ったもの", "4点"], ["支援した作者", "2人"]]);
check("まとめのカードは推し作者を並べる", summaryShareCard.list.map(r => [r.rank, r.name]),
  [[1, "SOUR FLAVOR"], [2, "べつのショップ"]]);
// 画像だけが転載されることがあるので、断り書きは画像にも要る
const rankingCard = buildRankingShareCard({ sort: "amount", rows: [{ name: "A", count: 1, total: 100 }] }, false);
check("ランキングのカードに断り書きを載せる", rankingCard.note, "金額は商品の合計（送料・クーポンを除く）");
check("ランキングのカードは金額を出す", rankingCard.list[0].value, "¥100");
const hiddenCard = buildRankingShareCard({ sort: "amount", rows: [{ name: "A", count: 1, total: 100 }] }, true);
check("金額を伏せたら断り書きも出さない", [hiddenCard.list[0].value, hiddenCard.note], ["", ""]);
const totalCard = buildTotalShareCard({ year: 2026, total: 100000, count: 5, yearTotal: 400, yearCount: 1, pendingCount: 0, indexComplete: true });
check("合計のカードは合計と今年を並べる", totalCard.stats.map(s => s.label), ["合計額", "2026年"]);

// 描画(実際にcanvasへ描けること。文字が1つも乗らないと真っ白なカードが出る)
const testCanvas = document.createElement("canvas");
testCanvas.width = SHARE_CARD_WIDTH;
testCanvas.height = SHARE_CARD_HEIGHT;
const testCtx = testCanvas.getContext("2d");
drawShareCard(testCtx, summaryShareCard, null);
const drawn = testCtx.getImageData(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT).data;
check("カードは背景で埋まる", drawn[3], 255);
check("カードに濃い文字が乗る",
  (() => { for (let i = 0; i < drawn.length; i += 4) { if (drawn[i] < 80 && drawn[i + 1] < 80) return true; } return false; })(), true);
// 長い名前をそのまま描くと隣の数字に重なる
testCtx.font = `bold 36px ${SHARE_CARD_FONT}`;
check("収まらない名前は切って…を付ける", fitText(testCtx, "あ".repeat(80), 200).endsWith("…"), true);
check("収まる名前はそのまま", fitText(testCtx, "短い名前", 400), "短い名前");
// 金額を切ると額そのものが変わってしまうので、切らずに字を小さくする
fitFontSize(testCtx, "¥1,234,567", 160, [52, 44, 38, 32], "bold");
check("収まらない金額は字を小さくする", testCtx.font.includes("32px"), true);
fitFontSize(testCtx, "¥100", 300, [52, 44, 38, 32], "bold");
check("収まる金額は大きいまま", testCtx.font.includes("52px"), true);

// パネルの開閉(背景を選び直しても同じ数字で描き直せるよう、押した時点の中身を持つ)
openSharePanel({ name: "booth-2026", text: "本文", card: summaryShareCard });
check("パネルを開くと本文を出す", [sharePanel.hidden, shareOverlay.hidden, shareText.value], [false, false, "本文"]);
check("保存するファイル名", shareCardFileName(), "booth-2026.png");
// 開いている間にフッターの共有を押しても何も起きない。押せる見た目のままだと壊れて見える
check("パネルを開いている間は共有ボタンを押せない", shareBtn.disabled, true);

// 縦横比。canvasの大きさごと変える
check("既定は16:9", [shareCanvas.width, shareCanvas.height], [1200, 675]);
setShareRatio("1:1");
check("1:1に変えるとcanvasも正方形になる", [shareCanvas.width, shareCanvas.height], [1080, 1080]);
check("押されている比率が分かる",
  [...shareRatioToggle.querySelectorAll(".segmented-btn")].map(b => b.getAttribute("aria-pressed")),
  ["false", "true", "false", "false"]);
setShareRatio("3:4");
check("3:4は縦長になる", [shareCanvas.width, shareCanvas.height], [900, 1200]);
// 縦長でも中身が入りきること(欠けると数字が読めない画像が出る)
check("縦長でも描ける", (() => {
  drawShareCard(shareCanvas.getContext("2d"), summaryShareCard, null);
  const data = shareCanvas.getContext("2d").getImageData(0, 0, shareCanvas.width, shareCanvas.height).data;
  for (let i = 0; i < data.length; i += 4) { if (data[i] < 80 && data[i + 1] < 80) return true; }
  return false;
})(), true);
check("知らない比率は無視する", (() => { setShareRatio("2:5"); return shareRatio; })(), "3:4");
setShareRatio("16:9");

// 状態表示は用が済んだら消す。前回の結果が残ると今の操作の結果と見分けが付かない
setShareCardStatus("画像を保存しました。");
check("状態表示を出す", shareCardStatus.textContent, "画像を保存しました。");
setShareCardStatus("");
check("空を渡すと消える", shareCardStatus.textContent, "");

closeSharePanel();
check("閉じると中身を捨てる", [sharePanel.hidden, sharePayload], [true, null]);
check("閉じると共有ボタンが戻る", shareBtn.disabled, false);

// --- CSV出力(データ出力の画面) ---
check("csvField そのまま", csvField("髪型A"), "髪型A");
check("csvField カンマを含む値は囲む", csvField("帽子, 赤"), '"帽子, 赤"');
check("csvField 引用符は重ねる", csvField('「"特"」'), '"「""特""」"');
check("csvField 改行を含む値は囲む", csvField("上\n下"), '"上\n下"');
check("csvField 値なしは空欄", [csvField(null), csvField(undefined)], ["", ""]);
// Excelで文字化けしないようBOMを付け、行はCRLFで区切る(RFC 4180)
check("toCsv はBOM付きのCRLF区切り", toCsv([["a", "b"], ["c", "d"]]), "\uFEFFa,b\r\nc,d");

const ordersLines = buildOrdersCsv(buildResults()).replace(/^\uFEFF/, "").split("\r\n");
check("注文CSVの見出し", ordersLines[0], "注文番号,注文日時,ステータス,お支払金額,ギフト額,商品合計,送料,差額,商品点数");
check("注文CSVは1注文1行", ordersLines.length, 1 + 6);
check("注文CSV 収集済みの行", ordersLines[1], "a1,2026年5月3日 12:34,発送完了,1000,400,1000,0,0,2");
// 0円の注文と区別が付かなくなるので、未収集や取得失敗は0ではなく空欄にする
check("注文CSV 未収集は空欄", ordersLines[2], "a2,2026年5月20日 09:00,支払済み,,,,,,");
check("注文CSV 取得失敗も空欄", ordersLines[5], "c2,2025年12月25日 10:00,未払い,,,,,,");

// \u9001\u6599\u306E\u3042\u308B\u6CE8\u6587\u306F\u3001\u5546\u54C1\u5408\u8A08\u3068\u9001\u6599\u306B\u5206\u3051\u3066\u66F8\u304D\u51FA\u3059
const shippedCsv = buildOrdersCsv([{
  id: "s1", date: "2026\u5E747\u670820\u65E5 17:01", status: "completed",
  amount: 4060, gift: 0, items: shipped.items, shipping: shipped.shipping,
}]).replace(/^\uFEFF/, "").split("\r\n");
check("\u6CE8\u6587CSV \u9001\u6599\u3092\u5206\u3051\u3066\u51FA\u3059", shippedCsv[1], "s1,2026\u5E747\u670820\u65E5 17:01,\u767A\u9001\u5B8C\u4E86,4060,0,3560,500,0,1");

const itemsLines = buildItemsCsv(buildResults()).replace(/^\uFEFF/, "").split("\r\n");
check("商品CSVの見出し", itemsLines[0], "注文番号,注文日時,ステータス,ショップ名,ショップURL,商品名,単価,数量,BOOST,ギフト");
check("商品CSVは1商品1行", itemsLines.length, 1 + 2 + 1 + 1 + 1 + 1 + 1);
check("商品CSV 商品の行", itemsLines[1],
  "a1,2026年5月3日 12:34,発送完了,SOUR FLAVOR,https://sourflavor.booth.pm/,髪型A,600,1,0,いいえ");
check("商品CSV ギフトの印", itemsLines[2].endsWith("髪型B,400,1,0,はい"), true);
// 黙って落とすと、その注文を買っていないように見えてしまう
check("商品CSV 明細の無い注文も行を残す", itemsLines[3], "a2,2026年5月20日 09:00,支払済み,,,(明細なし),,,,");
check("CSVのファイル名に書き出した日を入れる", csvFileName("orders", new Date(2026, 6, 5)), "booth-orders-20260705.csv");

// --- 画面の切り替え ---
// 別ページにするとJSのコンテキストごと破棄され、数分かかる収集が止まってしまうため、
// 同じページの中で区画を出し分ける。現在地はハッシュに持たせる
check("既定の画面", [viewFromHash(""), viewFromHash("#/report")], ["report", "report"]);
check("ハッシュで画面を決める", viewFromHash("#/export"), "export");
check("支出推移のハッシュ", viewFromHash("#/trends"), "trends");
check("知らないハッシュは既定の画面", viewFromHash("#/nope"), "report");

location.hash = "#/export";
renderCurrentView();
check("データ出力へ切り替わる",
  [document.getElementById("view-report").hidden, document.getElementById("view-export").hidden], [true, false]);
check("メニューに現在地が出る",
  [...navDrawer.querySelectorAll(".nav-link")].map(a => a.classList.contains("current")), [false, false, false, false, true, false]);
check("画面名を見出しに添える", viewTitle.textContent, "データ出力");
location.hash = "#/trends";
renderCurrentView();
check("支出推移へ切り替わる",
  [document.getElementById("view-report").hidden, document.getElementById("view-trends").hidden], [true, false]);
check("支出推移の画面名", viewTitle.textContent, "支出推移・前年比較");
location.hash = "#/report";
renderCurrentView();
check("レポートへ戻る",
  [document.getElementById("view-report").hidden, document.getElementById("view-export").hidden], [false, true]);
check("既定の画面では画面名を出さない", viewTitle.textContent, "");

menuBtn.click();
check("メニューが開く", [navDrawer.hidden, navOverlay.hidden, menuBtn.getAttribute("aria-expanded")], [false, false, "true"]);
navOverlay.click();
check("背景を押すと閉じる", [navDrawer.hidden, menuBtn.getAttribute("aria-expanded")], [true, "false"]);
menuBtn.click();
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
check("Escで閉じる", navDrawer.hidden, true);
menuBtn.click();
navDrawer.querySelector('.nav-link[data-view="export"]').click();
check("メニューから移動すると閉じる", navDrawer.hidden, true);
location.hash = "#/report";
renderCurrentView();

// データ出力の画面(何件書き出せるのか、金額のずれがあるかを示す)
render();
check("出力できる件数",
  exportStats.textContent,
  "注文: 6件 / 商品明細のある注文: 2件 / 商品: 3行 (明細を取れていない注文が4件あります)");
check("プレビューは商品の行だけ", exportPreviewBody.querySelectorAll("tr").length, 3);
check("ずれが無ければ知らせない", exportGap.hidden, true);

// お支払金額と商品合計がずれる注文(送料・クーポンなど)は見えるようにする
const savedA1 = state.cache.a1;
state.cache.a1 = { ...savedA1, amount: 1200 };
render();
check("金額のずれを知らせる", exportGap.hidden, false);
check("ずれた件数を出す", exportGap.textContent.includes("説明しきれない注文が1件"), true);
state.cache.a1 = savedA1;
render();

// --- 未収集の案内(レポート以外の画面) ---
// 数字だけを見せて黙っていると、実際より少ない額を正しい合計だと思わせてしまう
location.hash = "#/report";
renderCurrentView();
check("レポート画面では出さない", pendingBanner.hidden, true);

location.hash = "#/export";
renderCurrentView();
check("レポート以外では未収集を知らせる", pendingBanner.hidden, false);
check("未収集の件数を出す", pendingBannerText.textContent,
  "未収集の注文が4件あります。この画面の内容は実際より少なくなります。");
check("収集できる画面へ戻す導線がある", pendingBanner.querySelector("a").getAttribute("href"), "#/report");

// 索引が途中までなら、一覧に出ていない注文も残っている
state.index.complete = false;
renderCurrentView();
check("索引が未完了なら理由を書き足す", pendingBannerText.textContent,
  "未収集の注文が4件あります。注文履歴の取得が途中で終わっています。この画面の内容は実際より少なくなります。");
delete state.index.complete;

// 収集し終えていれば出さない
const savedCache = state.cache;
state.cache = Object.fromEntries(targetOrders().map(o => [o.id, { v: CACHE_SCHEMA_VERSION, amount: 100, gift: 0, shipping: 0, status: o.status, date: o.date, items: [item("何か", 100)] }]));
renderCurrentView();
check("すべて収集済みなら出さない", pendingBanner.hidden, true);
state.cache = savedCache;
location.hash = "#/report";
renderCurrentView();

// --- データの引っ越し(バックアップ／復元) ---
render();
check("引っ越し画面の件数と期間", backupStats.textContent,
  "注文: 6件(収集済み 2件 / 未収集 4件) / 期間: 2025年12月10日 〜 2026年5月20日");
check("取得済みの範囲も示す", backupCoverage.textContent, "注文履歴の取得済みの範囲: 全期間");

const backup = buildBackup(state.index, state.cache, new Date(2026, 6, 5));
check("バックアップの形式", [backup.format, backup.version], ["booth-purchase-report", 1]);
check("バックアップに注文履歴と金額が入る",
  [backup.index.orders.length, Object.keys(backup.cache).length], [7, 3]);
check("バックアップのファイル名", backupFileName(new Date(2026, 6, 5)), "booth-backup-20260705.json");

// 壊れたファイルでストレージを上書きしないよう、形を確かめてから使う
check("読み込み JSONでない", parseBackup("これはJSONではない").ok, false);
check("読み込み 別のJSON", parseBackup('{"foo":1}').message,
  "このファイルはBOOTHお買いものレポートのバックアップではありません。");
check("読み込み 配列", parseBackup("[1,2]").ok, false);
check("読み込み 注文履歴が壊れている",
  parseBackup('{"format":"booth-purchase-report","index":{"orders":"x"}}').message,
  "バックアップの注文履歴が壊れています。");
check("読み込み 金額データが壊れている",
  parseBackup('{"format":"booth-purchase-report","cache":[]}').message,
  "バックアップの金額データが壊れています。");
const restored = parseBackup(JSON.stringify(backup));
check("読み込み 書き出したものを読み戻せる",
  [restored.ok, restored.index.orders.length, Object.keys(restored.cache).length], [true, 7, 3]);

// 併合(入れ替えにすると、古いバックアップを読んだときに今あるものを失う)
const stamp = new Date(2026, 6, 5);
const idxA = { updatedAt: "x", complete: true, orders: [{ id: "m1", status: "completed", date: "2026年1月1日 00:00" }] };
const idxB = { updatedAt: "y", complete: true, orders: [{ id: "m2", status: "completed", date: "2025年1月1日 00:00" }] };
check("併合で両方の注文が残る", mergeOrderIndex(idxA, idxB, stamp).orders.map(o => o.id), ["m2", "m1"]);
check("両方が全期間なら全期間のまま", mergeOrderIndex(idxA, idxB, stamp).complete, true);
// 片方でも途中までだと、つないだ結果に抜けが無いとは言い切れない
check("片方が途中までなら未完了にする",
  [mergeOrderIndex({ ...idxA, complete: false }, idxB, stamp).complete,
   mergeOrderIndex(idxA, { ...idxB, complete: false }, stamp).complete], [false, false]);
check("読み込む側に注文履歴が無ければ今のまま", mergeOrderIndex(idxA, null, stamp), idxA);
check("今の注文履歴が無ければ読み込んだ側を使う", mergeOrderIndex(null, idxB, stamp), idxB);

const good = { v: CACHE_SCHEMA_VERSION, amount: 500, gift: 0, shipping: 0, items: [item("何か", 500)] };
const older = { v: CACHE_SCHEMA_VERSION, amount: 300, gift: 0, shipping: 0, items: [item("昔のもの", 300)] };
check("収集済みの方を残す",
  mergeOrderCache({ x: good }, { x: older }).x.amount, 500);
check("今が未収集なら読み込んだ側で埋める",
  mergeOrderCache({ x: { amount: null, items: null } }, { x: older }).x.amount, 300);
check("読み込んだ側にしか無い注文も取り込む",
  Object.keys(mergeOrderCache({ x: good }, { y: older })).sort(), ["x", "y"]);
check("どちらも未収集なら未収集のまま",
  mergeOrderCache({ x: { amount: null, items: null } }, { x: { amount: null, items: null } }).x.amount, null);
// 以前の版のバックアップを読み込んでも、それを収集済みとしては扱わない
// (取り直しが必要な状態が、復元によって収集済みに見えてしまうと直す手段が無くなる)
check("以前の版の復元は収集済みにしない",
  needsCollect(mergeOrderCache({}, { x: { amount: 300, items: [item("昔のもの", 300)] } }).x), true);

const mergedResult = mergeBackup(
  { index: idxA, cache: { x: good } },
  { index: idxB, cache: { x: older, y: good } },
  stamp
);
check("併合で増えた注文の件数", mergedResult.addedOrders, 1);
check("併合で増えた金額の件数", mergedResult.addedAmounts, 1);
check("併合しても今の収集済みは残る", mergedResult.cache.x.amount, 500);

// 画面下部の固定フッター(収集済みのみを対象にする)
const nowYear = new Date().getFullYear();
check("フッター 合計", footTotal.textContent, "¥4,000");
check("フッター 合計のギフト", footTotalGift.textContent, "ギフト ¥400");
check("フッター 合計の収集済み件数", footTotalCount.textContent, "収集済み 2件");
check("フッター 今年の見出し", footYearLabel.textContent, `${nowYear}年`);
// テストデータは2026年のみ当年に該当する(年が変わったら0件になるのが正しい)
check("フッター 今年の合計", footYearTotal.textContent, nowYear === 2026 ? "¥1,000" : "¥0");
check("フッター 今年のギフト", footYearGift.textContent, nowYear === 2026 ? "ギフト ¥400" : "");
check("フッター 今年の収集済み件数", footYearCount.textContent, nowYear === 2026 ? "収集済み 1件" : "収集済み 0件");

// アコーディオンの件数表示
check("内訳の件数表示", orderRowCount.textContent, "(6件)");

// 共有ボタン(投稿画面を開くだけ。文面は集計値から組み立てる)
check("収集済みがあれば共有できる", shareBtn.disabled, false);
check("共有用の金額例マスターは昇順", PURCHASE_EXAMPLE_MASTER.every((item, i) => i === 0 || PURCHASE_EXAMPLE_MASTER[i - 1].amount < item.amount), true);
check("共有用の金額例は商品名が重複しない", new Set(PURCHASE_EXAMPLE_MASTER.map((item) => item.label)).size, PURCHASE_EXAMPLE_MASTER.length);
check("共有用の金額例は抽象表現や複数個表現を含まない", PURCHASE_EXAMPLE_MASTER.every((item) => !/(ちょっとした|高性能な|本格的な|高級|プロ向け|\d+杯|\d+冊|\d+台分)/.test(item.label)), true);
const requiredPurchaseExampleTargets = [
  0,
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 1000),
  ...Array.from({ length: 9 }, (_, i) => (i + 2) * 10000),
  ...Array.from({ length: 9 }, (_, i) => (i + 2) * 100000),
  ...Array.from({ length: 9 }, (_, i) => (i + 2) * 1000000),
];
const purchaseExampleCategories = new Map();
for (const item of PURCHASE_EXAMPLE_MASTER) {
  purchaseExampleCategories.set(item.category, (purchaseExampleCategories.get(item.category) || 0) + 1);
}
check("共有用の金額例マスターは指定の探索価格帯を網羅", requiredPurchaseExampleTargets.every((target) => PURCHASE_EXAMPLE_MASTER.some((item) => item.target === target)), true);
check("共有用の金額例は12ジャンル以上", purchaseExampleCategories.size >= 12, true);
check("共有用の金額例は15ブランド以上", new Set(PURCHASE_EXAMPLE_MASTER.map((item) => item.brand)).size >= 15, true);
check("共有用の金額例は単一ジャンルが25%未満", Math.max(...purchaseExampleCategories.values()) / PURCHASE_EXAMPLE_MASTER.length < 0.25, true);
check("共有用の金額例は管理情報を完備", PURCHASE_EXAMPLE_MASTER.every((item) => item.category && item.brand), true);
check("共有用の金額例は合計以下で最高額", purchaseComparison(59979), "BALMUDA The Range");
check("共有用の金額例は実価格で切り替わる", purchaseComparison(59980), "Nintendo Switch 2");
check("共有用の金額例 ¥123,456", purchaseComparison(123456), "ルイ・ヴィトン ポルトフォイユ・ヴィクトリーヌ");
check("共有用の金額例は上限超過でも最後を使う", purchaseComparison(12000000), "レクサス RZ550e");
// 一番安い項目にも届かない額で比較を出すと「¥0でうまい棒が買える」という嘘になる
check("共有用の金額例 最安に届かなければ選ばない", [purchaseComparison(0), purchaseComparison(14)], [null, null]);
check("共有用の金額例 最安ちょうどは選ぶ", purchaseComparison(15), "うまい棒 コーンポタージュ味");
// 全期間の合計を名乗れるのは、索引が最古まで揃っていて未収集も無いときだけ
const shareable = { year: 2026, total: 4000, count: 2, yearTotal: 1000, yearCount: 1, pendingCount: 0, yearPendingCount: 0, indexComplete: true };
check("共有 未収集も取りこぼしも無ければ合計を出せる", canShareTotal(shareable), true);
check("共有 未収集があれば合計を出せない", canShareTotal({ ...shareable, pendingCount: 1 }), false);
check("共有 索引が未完了なら合計を出せない", canShareTotal({ ...shareable, indexComplete: false }), false);

check("共有文面", buildShareText(shareable),
  "BOOTHお買いもの振り返り🛍️\n\n合計：¥4,000（2件）\n今年：¥1,000（1件）\n\n積み重なって、Minecraft（Nintendo Switch版）が買えるくらいの金額になったようですね\n\n#BOOTHお買いものレポート");
check("共有文面 比較できない額なら比較の段落ごと出さない",
  buildShareText({ ...shareable, total: 0, count: 1, yearTotal: 0 }),
  "BOOTHお買いもの振り返り🛍️\n\n合計：¥0（1件）\n今年：¥0（1件）\n\n#BOOTHお買いものレポート");

// 合計を出せないときは今年の分だけにする。比較も文面に出した額(今年)を基準にしないと、
// 文面のどこにも無い金額をもとに「これが買える」と言うことになる
check("共有文面 未収集があれば合計の行を出さない",
  buildShareText({ ...shareable, pendingCount: 3 }),
  "BOOTHお買いもの振り返り🛍️\n\n今年：¥1,000（1件）\n\n積み重なって、すき家 ビビンバ牛丼（特盛）が買えるくらいの金額になったようですね\n\n#BOOTHお買いものレポート");
check("共有文面 比較の基準も今年の額になる",
  purchaseComparison(1000), "すき家 ビビンバ牛丼（特盛）");

// 共有前の確認。今年分に未収集があるなら、共有の前にそこだけ収集してしまう
check("共有の確認 今年分を取得してから共有する",
  shareConfirmMessage({ ...shareable, pendingCount: 5, yearPendingCount: 2 }),
  "未収集の注文が残っているため、全期間の合計は実際より少なくなります。\n今年分の未収集 2件 を取得してから、今年の金額だけを共有します。\nよろしいですか?");
check("共有の確認 今年分が揃っていれば取得しない",
  shareConfirmMessage({ ...shareable, pendingCount: 5, yearPendingCount: 0 }),
  "未収集の注文が残っているため、全期間の合計は実際より少なくなります。\n今年の金額だけを共有します。\nよろしいですか?");

// 共有前に収集する対象(日付を読めない注文はどの年にも入れない)
check("年で絞った注文", ordersInYear(2026).map(o => o.id), ["a1", "a2", "b1"]);
check("年で絞った注文 キャンセルは入らない", ordersInYear(2025).map(o => o.id), ["c1", "c2"]);
check("年で絞った注文 該当なし", ordersInYear(2024).map(o => o.id), []);

// 進捗はフッターに出す。表示中はフッターが高くなるので本文の下余白も追従させる
check("待機中は進捗を出さない", [document.getElementById("progress").hidden, document.body.classList.contains("has-progress")], [true, false]);
setProgress("金額を収集中... (18/40件)", 0.45);
check("進捗表示中はフッター拡張のクラスが付く", [document.getElementById("progress").hidden, document.body.classList.contains("has-progress")], [false, true]);
check("進捗バーの幅", document.getElementById("progressFill").style.width, "45%");
setRunning(false);
check("終了で進捗表示とクラスが戻る", [document.getElementById("progress").hidden, document.body.classList.contains("has-progress")], [true, false]);

// --- ①注文履歴の取得: 既知の注文への到達と、取得できた範囲の記録 ---

// 一覧は新しい順なので、以前が最古まで揃っていれば既知の注文に当たった時点で打ち切れる
const newRows = [{ id: "n1" }, { id: "n2" }, { id: "old1" }, { id: "n3" }];
const collected = [];
check("既知の注文で停止する", appendUnknown(collected, newRows, new Set(["old1"]), true), true);
check("停止までの分だけ取り込む", collected.map(o => o.id), ["n1", "n2"]);
const collected2 = [];
check("既知が無ければ最後まで進む", appendUnknown(collected2, newRows, new Set(), true), false);
check("全件取り込む", collected2.map(o => o.id), ["n1", "n2", "old1", "n3"]);

// 以前が未完了なら、既知の注文より古いところに抜けが残っているかもしれないので、
// 既知は読み飛ばして最後まで進む
const collected3 = [];
check("打ち切らない指定なら既知でも止まらない", appendUnknown(collected3, newRows, new Set(["old1"]), false), false);
check("既知を飛ばして残りを取り込む", collected3.map(o => o.id), ["n1", "n2", "n3"]);

// v1.2以前はフラグを持たないが、全ページ巡回に成功したときだけ保存していた
check("フラグが無い索引は完了扱い", indexIsComplete({ orders: [] }), true);
check("complete:false は未完了", indexIsComplete({ orders: [], complete: false }), false);
check("索引が無ければ未完了", indexIsComplete(null), false);

const OLD = [{ id: "o1", status: "completed", date: "2025年1月1日 00:00" }];
const NEW = [{ id: "n1", status: "completed", date: "2026年6月1日 00:00" }];

(async () => {
  // 増分取得: 既知に接続でき、以前が完全なら全体として完全なまま
  state.index = { updatedAt: "x", orders: OLD, complete: true };
  let added = await commitIndex(NEW, { force: false, reachedKnown: true, finishedAllPages: false, previousComplete: true });
  check("増分取得で既存と併合される", state.index.orders.map(o => o.id), ["o1", "n1"]);
  check("増分取得の追加件数", added, 1);
  check("既知に接続できれば完全なまま", state.index.complete, true);

  // 以前が未完了なら、増分を足しても未完了のまま
  state.index = { updatedAt: "x", orders: OLD, complete: false };
  await commitIndex(NEW, { force: false, reachedKnown: true, finishedAllPages: false, previousComplete: false });
  check("以前が未完了なら未完了のまま", state.index.complete, false);

  // 中断: 既知にも最古にも到達していないので未完了として記録する
  state.index = { updatedAt: "x", orders: OLD, complete: true };
  await commitIndex(NEW, { force: false, reachedKnown: false, finishedAllPages: false, previousComplete: true });
  check("途中で終わったら未完了として記録", state.index.complete, false);
  check("途中で終わっても取得済みは残る", state.index.orders.map(o => o.id), ["o1", "n1"]);

  // 全件再取得を最後までやり切った場合だけ、古い内容を置き換える
  state.index = { updatedAt: "x", orders: OLD, complete: false };
  await commitIndex(NEW, { force: true, reachedKnown: false, finishedAllPages: true, previousComplete: false });
  check("全件再取得の完了で置き換える", state.index.orders.map(o => o.id), ["n1"]);
  check("全件再取得の完了で完全になる", state.index.complete, true);

  // 全件再取得が途中で終わった場合は、既存を消さない(消すと以前の範囲まで失う)
  state.index = { updatedAt: "x", orders: OLD, complete: true };
  await commitIndex(NEW, { force: true, reachedKnown: false, finishedAllPages: false, previousComplete: false });
  check("全件再取得の中断では既存を残す", state.index.orders.map(o => o.id), ["o1", "n1"]);
  check("全件再取得の中断は未完了", state.index.complete, false);

  // 取得範囲のUI表示
  state.cache = {};
  state.index = { updatedAt: "2026-07-26T00:00:00.000Z", orders: [...OLD, ...NEW], complete: true };
  render();
  check("全期間の表示", indexCoverage.textContent, "取得済みの範囲: 全期間 (最古の注文 2025年1月1日 00:00)");
  check("全期間では警告しない", indexCoverage.classList.contains("warn"), false);

  state.index = { updatedAt: "2026-07-26T00:00:00.000Z", orders: [...OLD, ...NEW], complete: false };
  render();
  check("未完了は最古を示して警告する", indexCoverage.textContent.startsWith("取得済みの範囲: 最新 〜 2025年1月1日 00:00"), true);
  // 抜けは次の「注文履歴を取得」で埋まるので、全件再取得は案内しない
  check("未完了は再取得を案内する", indexCoverage.textContent.includes("もう一度「注文履歴を取得」"), true);
  check("未完了は警告色", indexCoverage.classList.contains("warn"), true);

  // --- キャッシュ削除 ---
  state.index = { updatedAt: "x", orders: [...OLD, ...NEW], complete: true };
  state.cache = { o1: { amount: 100, status: "completed", date: "2025年1月1日 00:00" } };
  render();
  check("削除欄に保存件数が出る", [clearIndexStatus.textContent, clearAmountsStatus.textContent], ["保存中: 2件", "保存中: 1件"]);

  await clearIndexData();
  check("注文履歴だけ消える", [state.index, Object.keys(state.cache).length], [null, 1]);
  check("削除後は保存件数の表示も変わる", clearIndexStatus.textContent, "保存されていません");
  check("消したものは削除ボタンを押せない", clearIndexBtn.disabled, true);
  check("残っている方は押せる", clearAmountsBtn.disabled, false);

  state.index = { updatedAt: "x", orders: [...OLD], complete: true };
  await clearAmountsData();
  check("金額だけ消える", [Object.keys(state.cache).length, state.index.orders.length], [0, 1]);
  check("金額を消すと未収集になる", document.getElementById("pendingCount").textContent, "未収集: 1件");
  check("金額を消すと合計は0", footTotal.textContent, "¥0");

  // --- 索引が無い場合(旧バージョンからの移行)はキャッシュだけで表示する ---
  state.index = null;
  state.cache = { z1: { amount: 500, status: "completed", date: "2024年1月1日 00:00" } };
  render();
  check("索引が無くてもキャッシュから表示", document.getElementById("totalAmount").textContent, "¥500");
  check("索引が無い場合は取得を促す", monthEmpty.hidden, false);
  check("索引が無ければ範囲表示も出さない", indexCoverage.hidden, true);

  // --- 日付を読み取れない注文しかない場合 ---
  state.index = { updatedAt: "2026-07-26T00:00:00.000Z", complete: true, orders: [{ id: "unknown-date", status: "completed", date: "日付なし" }] };
  state.cache = {};
  render();
  check("日付不明だけでも月別集計を表示", monthArea.hidden, false);
  check("日付不明だけなら範囲指定を隠す", rangeArea.hidden, true);
  check("日付不明の行は残す", monthTableBody.querySelectorAll("tr.unknown-row").length, 1);
  check("日付不明だけなら範囲選択肢は空", [rangeFrom.options.length, rangeTo.options.length], [0, 0]);

  // --- HTMLエスケープ ---
  state.index = { updatedAt: "2026-07-26T00:00:00.000Z", complete: true, orders: [{ id: "<img src=x onerror=alert(1)>", status: "completed", date: "2024年1月1日 00:00" }] };
  state.cache = {};
  render();
  check("HTMLエスケープ", orderTableBody.querySelector("tr").cells[3].querySelector("img"), null);

  // --- 進捗の残骸(タブが不意に閉じられると clearRunState が間に合わないことがある) ---
  await saveRunState({ phase: "金額の収集", current: 1, total: 10 });
  check("書いた直後の進捗は読める", (await loadRunState()).phase, "金額の収集");
  await writeStored(RUN_STATE_KEY, { phase: "金額の収集", updatedAt: Date.now() - RUN_STATE_STALE_MS - 1 });
  check("更新の止まった進捗は無視する", await loadRunState(), null);
  await writeStored(RUN_STATE_KEY, { phase: "金額の収集" });
  check("時刻を持たない旧形式の進捗も無視する", await loadRunState(), null);
  await clearRunState();

  // --- ①注文履歴の取得を、BOOTHへのアクセスを差し替えて実際に動かす ---
  // BOOTH以外(manifestやアイコン)への fetch は本物のまま通す
  const realFetch = window.fetch;
  const okResponse = (path, html) => ({ ok: true, status: 200, url: path, text: () => Promise.resolve(html) });
  let routes = {};
  // ルートは HTML文字列(そのまま200で返す)か、応答を組み立てる関数で指定する
  window.fetch = (url, init) => {
    const path = String(url);
    if (!path.startsWith("https://accounts.booth.pm")) return realFetch(url, init);
    const route = routes[path];
    if (route === undefined) {
      return Promise.resolve({ ok: false, status: 404, url: path, text: () => Promise.resolve("") });
    }
    return Promise.resolve(typeof route === "function" ? route(path) : okResponse(path, route));
  };
  const ORDERS_URL = "https://accounts.booth.pm/orders";
  const orderLink = (id, date) => `<a class="nav-reverse" href="/orders/${id}">
    <div class="badge mx-0 align-top order-state completed">発送完了</div>
    <div class="u-tpg-caption2">注文日時: ${date}</div></a>`;

  const resetIndex = () => { state.index = null; state.cache = {}; };

  // ページ送りが無く注文も読めた ＝ 最古まで辿れたので全期間
  resetIndex();
  routes = { [ORDERS_URL]: `<html><body>${orderLink("p1", "2026年5月3日 12:34")}</body></html>` };
  await runTask((signal) => fetchIndexTask(signal, false));
  check("1ページだけの履歴は全期間として記録", state.index.complete, true);
  check("1ページだけの履歴は注文を取り込む", state.index.orders.map(o => o.id), ["p1"]);

  // ページ送りの枠はあるのにページ番号を読めない ＝ 構造変更の疑い
  resetIndex();
  routes = { [ORDERS_URL]: `<html><body>${orderLink("p1", "2026年5月3日 12:34")}<div class="pager"><span>1</span></div></body></html>` };
  await runTask((signal) => fetchIndexTask(signal, false));
  check("ページ番号を読めなければ全期間扱いにしない", state.index.complete, false);
  check("読み取り失敗は警告する", noticeBox.textContent.includes("読み取れませんでした"), true);
  render();
  check("読み取り失敗は取得範囲にも警告を出す", indexCoverage.classList.contains("warn"), true);

  // 行を1件も読めない ＝ セレクタが効いていない(または履歴が空)
  resetIndex();
  routes = { [ORDERS_URL]: "<html><body></body></html>" };
  await runTask((signal) => fetchIndexTask(signal, false));
  check("1件も読めなければ全期間扱いにしない", state.index.complete, false);

  // --- 中断で途中までしか取れていない索引は、次の取得で抜けた範囲まで辿り直す ---
  // (既知の注文で打ち切ると、その先に残った抜けを永久に拾えない)
  const pagedRoutes = (page2Seen) => ({
    [ORDERS_URL]: `<html><body>${orderLink("g1", "2026年6月1日 00:00")}${orderLink("g2", "2026年5月1日 00:00")}
      <div class="pager"><a href="/orders?page=2">2</a></div></body></html>`,
    [`${ORDERS_URL}?page=2`]: (path) => {
      page2Seen.push(path);
      return okResponse(path, `<html><body>${orderLink("g3", "2025年4月1日 00:00")}${orderLink("g4", "2025年3月1日 00:00")}
        <div class="pager"><a href="/orders?page=2">2</a></div></body></html>`);
    },
  });
  const partialIndex = (complete) => ({
    updatedAt: "x", complete,
    orders: [
      { id: "g1", status: "completed", date: "2026年6月1日 00:00" },
      { id: "g2", status: "completed", date: "2026年5月1日 00:00" },
    ],
  });

  resetIndex();
  const seenWhenPartial = [];
  routes = pagedRoutes(seenWhenPartial);
  state.index = partialIndex(false);
  await runTask((signal) => fetchIndexTask(signal, false));
  check("未完了の索引は既知で止まらず最古まで辿る", state.index.orders.map(o => o.id), ["g1", "g2", "g3", "g4"]);
  check("未完了なら2ページ目まで見に行く", seenWhenPartial.length, 1);
  check("抜けを埋めたら全期間として記録", state.index.complete, true);
  check("抜けを埋めたことを知らせる", noticeBox.textContent.includes("抜けていた範囲も含めて最古まで取得"), true);

  // 最古まで揃っている索引なら、既知に当たった時点で打ち切る(取得済みを読み直さない)
  resetIndex();
  const seenWhenComplete = [];
  routes = pagedRoutes(seenWhenComplete);
  state.index = partialIndex(true);
  await runTask((signal) => fetchIndexTask(signal, false));
  check("揃っていれば既知で停止する", noticeBox.textContent.includes("取得済みの注文に到達したため"), true);
  check("新しい注文が無ければ0件と伝える", noticeBox.textContent.includes("新しく追加された注文: 0件"), true);
  check("揃っていれば2ページ目は見に行かない", seenWhenComplete.length, 0);
  check("停止しても全期間のまま", state.index.complete, true);

  // 全件再取得を中断しても、収集済みの金額は消さない。
  // 消してしまうと「ここまでに取得した金額は保存されている」という案内が嘘になる
  resetIndex();
  state.cache = { keep: { amount: 555, gift: 0, status: "completed", date: "2025年1月1日 00:00" } };
  forceRefreshAll.checked = true;
  routes = { [ORDERS_URL]: () => Promise.reject(abortError()) };
  await runTask(runAllTask);
  check("全件再取得を中断しても収集済みの金額は残る", state.cache.keep && state.cache.keep.amount, 555);
  check("中断は中断として扱われる", noticeBox.textContent.includes("中断しました"), true);
  forceRefreshAll.checked = false;

  // --- ②金額の収集: 一時的な通信エラーで全体を止めない ---
  const detailUrl = (id) => `https://accounts.booth.pm/orders/${id}`;
  const detailHtml = (yen) => orderHtml(String(yen), sheetGroup("ダウンロード商品", [[yen, 0]]));
  const indexOf2 = (a, b) => ({
    updatedAt: "x", complete: true,
    orders: [
      { id: a, status: "completed", date: "2026年1月1日 00:00" },
      { id: b, status: "completed", date: "2026年1月2日 00:00" },
    ],
  });
  // 未収集のときに落ちず FAIL として出るよう、取り出しは防御的にする
  const cachedAmount = (id) => (state.cache[id] ? state.cache[id].amount : undefined);
  const savedRetryWait = fetchRetryWaitMs;
  fetchRetryWaitMs = 1; // 待ち時間はテストでは詰める

  // 1回失敗しても試し直して拾える
  state.index = indexOf2("ok1", "flaky");
  state.cache = {};
  let flakyTries = 0;
  routes = {
    [detailUrl("ok1")]: detailHtml(1000),
    [detailUrl("flaky")]: (path) => {
      flakyTries++;
      return flakyTries === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : okResponse(path, detailHtml(2000));
    },
  };
  await runTask((signal) => collectAmounts(targetOrders(), false, signal));
  check("一時的な通信エラーは試し直す", flakyTries, 2);
  check("試し直して収集できる", [cachedAmount("ok1"), cachedAmount("flaky")], [1000, 2000]);
  // 版数を書き忘れると、収集した直後から未収集に戻り、毎回の実行で取り直し続ける
  check("収集したエントリに版数が入る", state.cache.ok1.v, CACHE_SCHEMA_VERSION);
  check("収集した直後は取り直しの対象にならない", needsCollect(state.cache.ok1), false);

  // 試し直しても駄目な注文は飛ばして、残りの収集を続ける
  state.index = indexOf2("ok2", "broken");
  state.cache = {};
  let brokenTries = 0;
  routes = {
    [detailUrl("ok2")]: detailHtml(3000),
    [detailUrl("broken")]: () => {
      brokenTries++;
      return Promise.reject(new TypeError("Failed to fetch"));
    },
  };
  await runTask((signal) => collectAmounts(targetOrders(), false, signal));
  check("諦めるまでの試行回数", brokenTries, fetchRetryCount + 1);
  check("失敗しても他の注文の収集は続く", cachedAmount("ok2"), 3000);
  check("失敗した注文はキャッシュに残さない(未収集のまま拾い直せる)", state.cache.broken, undefined);
  check("失敗した件数を知らせる", noticeBox.textContent.includes("1件は通信に失敗"), true);
  check("失敗は例外にせず最後まで進む", errorBox.hidden, true);

  // ログイン切れは試し直しても直らないので、その場で止めて理由を出す
  state.index = indexOf2("s1", "s2");
  state.cache = {};
  let signInTries = 0;
  routes = {
    [detailUrl("s1")]: () => {
      signInTries++;
      return { ok: true, status: 200, url: "https://accounts.booth.pm/users/sign_in", text: () => Promise.resolve("") };
    },
    [detailUrl("s2")]: detailHtml(4000),
  };
  await runTask((signal) => collectAmounts(targetOrders(), false, signal));
  check("ログイン切れは試し直さない", signInTries, 1);
  check("ログイン切れはその場で止める", state.cache.s2, undefined);
  check("ログイン切れは理由を出す", errorBox.textContent.includes("ログインが必要です"), true);

  fetchRetryWaitMs = savedRetryWait;
  window.fetch = realFetch;
  resetIndex();

  // --- 𝕏共有ボタン(実際のHTMLとCSSが表示仕様どおりか) ---
  const dashboardHtml = await (await fetch("../extension/dashboard.html")).text();
  const dashboardDoc = new DOMParser().parseFromString(dashboardHtml, "text/html");
  const dashboardShareBtn = dashboardDoc.getElementById("shareBtn");
  check("共有ボタンは飾り文字の𝕏を使う", dashboardShareBtn.textContent.trim(), "𝕏で共有");
  check("共有ボタンに専用クラスを付ける", dashboardShareBtn.classList.contains("share-btn"), true);
  check("支出推移画面をメニューから開ける",
    dashboardDoc.querySelector('.nav-link[data-view="trends"]').getAttribute("href"), "#/trends");
  check("支出推移画面に共用の年別月別表がある",
    Boolean(dashboardDoc.getElementById("trendPeriodTableBody")), true);

  // ショップ別の金額は商品の合計なので、全体の合計支払額とは一致しない。
  // 断りを外すと、送料やクーポンの分だけ少ない額を「そのショップに使った額」として見せることになる
  check("ランキングに合計と一致しない旨の断りがある",
    dashboardHtml.includes("全体の合計額とは一致しません"), true);
  check("ランキング画面をメニューから開ける",
    dashboardDoc.querySelector('.nav-link[data-view="ranking"]').getAttribute("href"), "#/ranking");
  check("メニューに追加した画面が並んでいる",
    [...dashboardDoc.querySelectorAll(".nav-link")].map((a) => a.getAttribute("href")),
    ["#/report", "#/ranking", "#/trends", "#/summary", "#/export", "#/backup"]);
  // まとめの作者別金額もランキングと同じ商品合計なので、同じ断りを画面に出す
  check("まとめに合計と一致しない旨の断りがある",
    dashboardHtml.includes("足しても上の合計額とは一致しません"), true);
  // 年別・月別は合計額の内訳なので同じ枠に入れ、既定では畳んでおく
  const periodAccordion = dashboardDoc.getElementById("periodAccordion");
  check("年別・月別は合計額の中に入れる",
    periodAccordion.closest("#summarySection") !== null, true);
  check("年別・月別は畳んだ状態で始める", periodAccordion.hasAttribute("open"), false);
  check("年別・月別の表はその中にある",
    periodAccordion.querySelector("#periodTableBody") !== null, true);
  // 一括集計はこの画面で最初に押すボタンなので、他と同じ白地だと見つけられない
  check("一括集計は目立つ色にする",
    dashboardDoc.getElementById("runAllBtn").className, "primary");

  // 読み込めなかったファイルを名指しできるよう、スクリプトの一覧と対応させる
  const harnessDoc = new DOMParser().parseFromString(await (await fetch("index.html")).text(), "text/html");
  check("読み込み確認は全ての拡張スクリプトを見ている",
    [...harnessDoc.querySelectorAll('script[src^="../extension/"]')].map(s => s.getAttribute("src").replace("../extension/", "")),
    REQUIRED_GLOBALS.map(([file]) => file));

  const dashboardCss = await (await fetch("../extension/dashboard.css")).text();
  const dashboardStyle = document.createElement("style");
  dashboardStyle.textContent = dashboardCss;
  document.head.appendChild(dashboardStyle);
  const shareButtonStyle = getComputedStyle(shareBtn);
  check("共有ボタンの背景は黒", shareButtonStyle.backgroundColor, "rgb(0, 0, 0)");
  check("共有ボタンの文字は白", shareButtonStyle.color, "rgb(255, 255, 255)");
  check("支出推移の要約はカード配置", getComputedStyle(trendSummary).display, "grid");
  const trendLineFixture = svgEl("polyline", { class: "trend-line current" });
  cumulativeTrendChart.appendChild(trendLineFixture);
  check("今年の累計線はアクセント色",
    getComputedStyle(trendLineFixture).stroke, "rgb(252, 77, 80)");
  trendLineFixture.remove();
  dashboardStyle.remove();

  // --- アイコン(パッケージ化に必要。宣言と実ファイルがずれていても拡張は読み込めてしまう) ---
  const ICON_SIZES = [16, 32, 48, 128];
  const manifest = await (await fetch("../extension/manifest.json")).json();
  const expectedIcons = Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icons/icon${s}.png`]));

  // 未リリースのうちは 0.x に留める。1.0.0 に上げるのはリリースを宣言するときだけ
  check("バージョンは 0.x(未リリース)", /^0\.\d+\.\d+$/.test(manifest.version), true);

  check("manifestのiconsに4サイズを宣言", manifest.icons, expectedIcons);
  check("ツールバー用のdefault_iconも同じ4サイズ", manifest.action.default_icon, expectedIcons);

  const iconSizes = [];
  for (const size of ICON_SIZES) {
    const res = await fetch(`../extension/${expectedIcons[String(size)]}`);
    if (!res.ok) {
      iconSizes.push(`${size}: HTTP ${res.status}`);
      continue;
    }
    const bitmap = await createImageBitmap(await res.blob());
    iconSizes.push(`${size}: ${bitmap.width}x${bitmap.height}`);
  }
  check("アイコンの実ファイルが宣言どおりの寸法", iconSizes, ICON_SIZES.map((s) => `${s}: ${s}x${s}`));

  document.getElementById("out").textContent =
    lines.join("\n") + `\n\n---- ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (${lines.length} checks) ----`;
})();
