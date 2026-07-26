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
check("parseDetailPage 支払金額とステータス", parseDetailPage(parse(detailHtml)), { amount: 1234, status: "paid" });
check("parseDetailPage 金額が無い場合", parseDetailPage(parse("<html><body></body></html>")), { amount: null, status: "unknown" });

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
check("注文IDでの重複除去", new Map(list.orders.map(o => [o.id, o])).size, 2);

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
  a1: { amount: 1000, status: "completed", date: "2026年5月3日 12:34" },
  c1: { amount: 3000, status: "completed", date: "2025年12月10日 10:00" },
  c2: { amount: null, status: "unpaid", date: "2025年12月25日 10:00" }, // 取得失敗
};

check("キャンセルは集計対象から外れる", targetOrders().map(o => o.id), ["a1", "a2", "b1", "c1", "c2", "e1"]);

// 月別の収集状況(新しい月が先、日付不明は末尾)
const stats = buildMonthStats(targetOrders(), state.cache);
check("月別の並び", stats.map(s => s.label), ["2026年5月", "2026年3月", "2025年12月", "日付不明"]);
check("2026年5月の注文数/収集済み/未収集", [stats[0].count, stats[0].collected, stats[0].pending], [2, 1, 1]);
check("2026年3月は全て未収集", [stats[1].count, stats[1].collected, stats[1].pending], [1, 0, 1]);
check("2025年12月は取得失敗も収集済みとして数える", [stats[2].count, stats[2].collected, stats[2].pending], [2, 2, 0]);
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
check("取得失敗は再取得されない(強制指定が必要)", pendingTargets(ordersInRange("2025-12", "2025-12"), false).map(o => o.id), []);

// 表示用の一覧(未収集と取得失敗を区別する)
const results = buildResults();
check("未収集はundefined", results.find(r => r.id === "a2").amount, undefined);
check("取得失敗はnull", results.find(r => r.id === "c2").amount, null);
check("収集済みは数値", results.find(r => r.id === "a1").amount, 1000);

// --- 描画 ---
render();
check("合計は収集済みのみ", document.getElementById("totalAmount").textContent, "¥4,000");
check("収集済み件数", document.getElementById("totalCount").textContent, "収集済み: 2件");
check("未収集件数", document.getElementById("pendingCount").textContent, "未収集: 3件");
check("除外と取得失敗", document.getElementById("skippedCount").textContent, "除外(キャンセル): 1件 / 金額取得失敗: 1件");
check("索引の状態表示", indexStatus.textContent.includes("注文数: 6件"), true);

const monthRows = [...monthTableBody.querySelectorAll("tr[data-month-key]")];
check("月別テーブルの行数", monthRows.length, 4);
check("未収集がある月は強調", monthRows[0].classList.contains("has-pending"), true);
check("未収集が無い月は強調しない", monthRows[2].classList.contains("has-pending"), false);
check("範囲の選択肢は日付不明を除く", [...rangeFrom.options].map(o => o.value), ["2026-05", "2026-03", "2025-12"]);
check("初期選択は未収集のある最新月", [rangeFrom.value, rangeTo.value], ["2026-05", "2026-05"]);

// 行クリックでその月が範囲になる
monthRows[1].click();
check("行クリックで範囲設定", [rangeFrom.value, rangeTo.value], ["2026-03", "2026-03"]);
check("選択範囲の行が強調される", [monthRows[0], monthRows[1], monthRows[2]].map(r => r.classList.contains("in-range")), [false, true, false]);

// 日付不明の行はクリックしても範囲を変えない
monthRows[3].click();
check("日付不明の行は範囲に入らない", [rangeFrom.value, rangeTo.value], ["2026-03", "2026-03"]);
check("日付不明の案内が出る", unknownArea.hidden, false);
check("日付不明は一括集計へ誘導する", unknownCount.textContent.includes("まとめて一括集計"), true);

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
check("すべて収集済みなら予定なし", plannedCount.textContent, "取得予定: なし(収集済み)");
check("予定が0ならボタンを押せない", collectRangeBtn.disabled, true);

// 未収集のある範囲をまとめて選択
selectPendingBtn.click();
check("未収集のある範囲を選択", [rangeFrom.value, rangeTo.value], ["2026-03", "2026-05"]);
check("範囲選択で予定件数も更新される", plannedCount.textContent, "取得予定: 2件");

// 年別・月別の集計(収集済みのみ)
const yearRows = [...periodTableBody.querySelectorAll(".year-row")];
check("年行の数", yearRows.length, 2);
check("2026年の収集済み合計", [...yearRows[0].cells].map(c => c.textContent.trim()), ["▸ 2026年", "1件", "¥1,000"]);
check("2025年の収集済み合計", [...yearRows[1].cells].map(c => c.textContent.trim()), ["▸ 2025年", "1件", "¥3,000"]);
check("初期状態で月行は畳まれている", [...periodTableBody.querySelectorAll(".month-row")].every(r => r.hidden), true);
yearRows[0].querySelector(".toggle").click();
check("年行クリックで展開", [...periodTableBody.querySelectorAll('.month-row[data-year-key="2026"]')].every(r => !r.hidden), true);

// 注文ごとの内訳
const orderRows = [...orderTableBody.querySelectorAll("tr")];
check("内訳は日付の降順(日付不明は末尾)", orderRows.map(tr => tr.cells[3].textContent), ["a2", "a1", "b1", "c2", "c1", "e1"]);
check("未収集の表示", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[2].textContent, "未収集");
check("取得失敗の表示", orderRows.find(tr => tr.cells[3].textContent === "c2").cells[2].textContent, "取得失敗");
check("ステータス日本語化", orderRows.find(tr => tr.cells[3].textContent === "a2").cells[1].textContent, "支払済み");

// 画面下部の固定フッター(収集済みのみを対象にする)
const nowYear = new Date().getFullYear();
check("フッター 合計", footTotal.textContent, "¥4,000");
check("フッター 合計の収集済み件数", footTotalCount.textContent, "収集済み 2件");
check("フッター 今年の見出し", footYearLabel.textContent, `${nowYear}年`);
// テストデータは2026年のみ当年に該当する(年が変わったら0件になるのが正しい)
check("フッター 今年の合計", footYearTotal.textContent, nowYear === 2026 ? "¥1,000" : "¥0");
check("フッター 今年の収集済み件数", footYearCount.textContent, nowYear === 2026 ? "収集済み 1件" : "収集済み 0件");

// アコーディオンの件数表示
check("内訳の件数表示", orderRowCount.textContent, "(6件)");

// --- 索引が無い場合(旧バージョンからの移行)はキャッシュだけで表示する ---
state.index = null;
state.cache = { z1: { amount: 500, status: "completed", date: "2024年1月1日 00:00" } };
render();
check("索引が無くてもキャッシュから表示", document.getElementById("totalAmount").textContent, "¥500");
check("索引が無い場合は取得を促す", monthEmpty.hidden, false);

// --- HTMLエスケープ ---
state.index = { updatedAt: "2026-07-26T00:00:00.000Z", orders: [{ id: "<img src=x onerror=alert(1)>", status: "completed", date: "2024年1月1日 00:00" }] };
state.cache = {};
render();
check("HTMLエスケープ", orderTableBody.querySelector("tr").cells[3].querySelector("img"), null);

setTimeout(() => {
  document.getElementById("out").textContent =
    lines.join("\n") + `\n\n---- ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (${lines.length} checks) ----`;
}, 800);
