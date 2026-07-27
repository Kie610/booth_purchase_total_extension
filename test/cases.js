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
check("parseDetailPage 支払金額", parseDetailPage(parse(detailHtml)), { amount: 1234, gift: null });
check("parseDetailPage 金額が無い場合", parseDetailPage(parse("<html><body></body></html>")), { amount: null, gift: null });

// --- 支払額に含まれるギフト分 ---
// 注文詳細はショップ・商品種別ごとに .sheet-group で区切られ、先頭に見出しが入る
function itemSheet(price, boost) {
  return `<div class="sheet sheet--p400">
    <div class="u-tpg-caption1 text-[#505c6b]">¥ ${price}</div>
    <div class="u-tpg-caption1 text-[#505c6b]"><span class="particulars-heading">BOOST<i class="icon-boost"></i></span>¥ ${boost}</div>
  </div>`;
}
function sheetGroup(title, items) {
  return `<div class="sheet-group sheet-group--outline0">
    <div class="sheet sheet--p400"><div class="l-row flex-[1]">
      <div class="l-col-pc flex items-center"><b class="u-tpg-title3">${title}</b></div>
      <div class="l-col-pc-auto"><a class="btn small calm">ショップにメッセージを送る</a></div>
    </div></div>
    ${items.map(([p, b]) => itemSheet(p, b)).join("")}
  </div>`;
}
function orderHtml(total, groups) {
  return `<html><body>
    <span class="mx-0 badge order-state completed">発送完了</span>
    <div class="l-row text-14">
      <div class="l-col-pc-3 text-[#505c6b]">お支払金額</div><div class="l-col-pc-9">¥ ${total}</div>
    </div>
    ${groups}
  </body></html>`;
}

check("parseYenAmount ラベルと同じ要素にある金額", parseYenAmount("BOOST¥ 0"), 0);
check("parseYenAmount 桁区切り", parseYenAmount("¥ 5,100"), 5100);
check("parseYenAmount 金額が無い", parseYenAmount("ショップにメッセージを送る"), null);

const withGift = orderHtml("5,100",
  sheetGroup("ダウンロード商品", [[425, 0], [425, 0]]) +
  sheetGroup("ギフト", [[425, 0], [425, 100]]));
check("ギフトのグループだけを合計する", parseDetailPage(parse(withGift)), { amount: 5100, gift: 950 });

const noGift = orderHtml("850", sheetGroup("ダウンロード商品", [[425, 0], [425, 0]]));
check("ギフトが無い注文は0", parseDetailPage(parse(noGift)).gift, 0);

const multiGift = orderHtml("2,000",
  sheetGroup("ギフト", [[500, 0]]) +
  sheetGroup("ダウンロード商品", [[500, 0]]) +
  sheetGroup("ギフト", [[1000, 0]]));
check("ギフトのグループが複数あれば合算する", parseDetailPage(parse(multiGift)).gift, 1500);

// 構造が変わってグループが見つからない場合は、0と断定せず不明にする
check("グループが無ければ不明", parseDetailPage(parse(`<html><body>
  <div>お支払金額</div><div>¥ 100</div></body></html>`)).gift, null);

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
state.cache = {
  a1: { amount: 1000, gift: 400, status: "completed", date: "2026年5月3日 12:34" },
  c1: { amount: 3000, status: "completed", date: "2025年12月10日 10:00" }, // 旧キャッシュ(ギフト情報なし)
  c2: { amount: null, status: "unpaid", date: "2025年12月25日 10:00" }, // 取得失敗
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
check("needsCollect 未収集と取得失敗だけが対象", [needsCollect(undefined), needsCollect({ amount: null }), needsCollect({ amount: 0 }), needsCollect({ amount: 500 })], [true, true, false, false]);

// 表示用の一覧(未収集と取得失敗を区別する)
const results = buildResults();
check("未収集はundefined", results.find(r => r.id === "a2").amount, undefined);
check("取得失敗はnull", results.find(r => r.id === "c2").amount, null);
check("収集済みは数値", results.find(r => r.id === "a1").amount, 1000);

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
state.cache.c2 = { ...failedC2, amount: 500 };
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

// 注文ごとの内訳
const orderRows = [...orderTableBody.querySelectorAll("tr")];
check("内訳は日付の降順(日付不明は末尾)", orderRows.map(tr => tr.cells[3].textContent), ["a2", "a1", "b1", "c2", "c1", "e1"]);
check("未収集の表示", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[2].textContent, "未収集");
check("内訳のギフト併記", orderRows.find(tr => tr.cells[3].textContent === "a1").cells[2].textContent, "ギフト ¥400¥1,000");
check("ギフトが無い注文は金額のみ", orderRows.find(tr => tr.cells[3].textContent === "c1").cells[2].textContent, "¥3,000");
check("取得失敗の表示", orderRows.find(tr => tr.cells[3].textContent === "c2").cells[2].textContent, "取得失敗");
check("ステータス日本語化", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[1].textContent, "支払済み");

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
  "BOOTHお買いもの振り返り🛍️\n\n合計：¥4,000（2件）\n今年：¥1,000（1件）\n\n積み重ねてみると、Minecraft（Nintendo Switch版）が買えるくらいの金額になりました。\n\n#BOOTHお買いものレポート");
check("共有文面 比較できない額なら比較の段落ごと出さない",
  buildShareText({ ...shareable, total: 0, count: 1, yearTotal: 0 }),
  "BOOTHお買いもの振り返り🛍️\n\n合計：¥0（1件）\n今年：¥0（1件）\n\n#BOOTHお買いものレポート");

// 合計を出せないときは今年の分だけにする。比較も文面に出した額(今年)を基準にしないと、
// 文面のどこにも無い金額をもとに「これが買える」と言うことになる
check("共有文面 未収集があれば合計の行を出さない",
  buildShareText({ ...shareable, pendingCount: 3 }),
  "BOOTHお買いもの振り返り🛍️\n\n今年：¥1,000（1件）\n\n積み重ねてみると、すき家 ビビンバ牛丼（特盛）が買えるくらいの金額になりました。\n\n#BOOTHお買いものレポート");
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
