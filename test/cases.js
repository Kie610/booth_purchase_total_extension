const lines = [];
let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}` + (ok ? "" : `\n        expected=${e}\n        actual  =${a}`));
}

// --- parseOrderDate の表記ゆれ吸収 ---
check("parseOrderDate 和暦区切り", parseOrderDate("2024年5月3日 12:34"), { year: 2024, month: 5, day: 3, sortKey: 20240503 });
check("parseOrderDate スラッシュ", parseOrderDate("2024/05/03 12:34"), { year: 2024, month: 5, day: 3, sortKey: 20240503 });
check("parseOrderDate ハイフン", parseOrderDate("2023-07-15 18:20"), { year: 2023, month: 7, day: 15, sortKey: 20230715 });
check("parseOrderDate 解析不能", parseOrderDate("不明"), null);
check("parseOrderDate 空", parseOrderDate(""), null);
check("formatYen", formatYen(1234567), "¥1,234,567");

// --- DOMParserで生成した文書は不活性であること ---
// 取得したHTMLにはreCAPTCHAのscriptタグや画像が含まれるが、
// 解析しても実行・取得は行われない
function parse(html) {
  return new DOMParser().parseFromString(html, "text/html");
}
const scriptedHtml = `<html><head>
<script src="https://www.google.com/recaptcha/enterprise.js?render=DUMMY"></` + `script>
<` + `script>window.__should_not_run = true;</` + `script>
</head><body>
<img src="https://booth.pximg.net/thumb.jpg" alt="商品">
<div id="keep">残る</div>
</body></html>`;
const parsed = parse(scriptedHtml);
check("インラインscriptは実行されない", window.__should_not_run === undefined, true);
check("scriptや画像が含まれていても本文は読める", parsed.getElementById("keep").textContent, "残る");

// --- parseDetailPage: 注文詳細から支払金額とステータスを取得 ---
const detailHtml = `<html><head>
<script src="https://www.google.com/recaptcha/enterprise.js?render=DUMMY"></` + `script>
</head><body>
<div class="badge mx-0 align-top order-state paid">支払済み</div>
<div class="summary"><div>商品代金</div><div>¥1,000</div></div>
<div class="summary"><div>お支払金額</div><div>¥1,234</div></div>
</body></html>`;
check("parseDetailPage 支払金額とステータス", parseDetailPage(parse(detailHtml)), { amount: 1234, status: "paid" });
check("parseDetailPage 金額が無い場合", parseDetailPage(parse("<html><body></body></html>")), { amount: null, status: "unknown" });

// --- parseListPage: 一覧の行と最大ページ数 ---
// 実際の一覧行にはサムネイル画像が含まれるが、行の抽出に影響しないこと
const listHtml = `<html><body>
<a class="nav-reverse" href="/orders/1001">
  <img src="https://booth.pximg.net/thumb-1.jpg">
  <div class="badge mx-0 align-top order-state completed">発送完了</div>
  <div class="u-tpg-caption2">注文日時: 2026年5月3日 12:34</div>
</a>
<a class="nav-reverse" href="/orders/1001">
  <img src="https://booth.pximg.net/thumb-2.jpg">
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
check("parseListPage 行の抽出(重複行はそのまま返る)", list.orders,
  [{ id: "1001", status: "completed", date: "2026年5月3日 12:34" },
   { id: "1001", status: "completed", date: "2026年5月3日 12:34" },
   { id: "1002", status: "cancelled", date: "2026年4月1日 09:00" }]);
check("parseListPage 最大ページ数", list.maxPage, 7);
// 同一注文の重複行を注文IDで畳む(二重カウント防止の要)
check("注文IDでの重複除去", new Map(list.orders.map(o => [o.id, o])).size, 2);

// --- 集計とレンダリング ---
const results = [
  { id: "a", date: "2024年5月3日 12:34", status: "completed", amount: 1000 },
  { id: "b", date: "2024年5月20日 09:00", status: "paid", amount: 2500 },
  { id: "c", date: "2024/12/01 10:00", status: "completed", amount: 500 },
  { id: "d", date: "2023-07-15 18:20", status: "completed", amount: 3000 },
  { id: "e", date: "不明", status: "unknown", amount: 800 },
  { id: "f", date: "2024年5月3日 12:34", status: "completed", amount: null },
];

const agg = aggregateByPeriod(results);
check("年の並び(降順・日付不明は末尾)", agg.map(y => y.label), ["2024年", "2023年", "日付不明"]);
check("2024年の合計", [agg[0].count, agg[0].total], [3, 4000]);
check("2024年の月内訳(降順)", agg[0].months.map(m => [m.label, m.count, m.total]), [["12月", 1, 500], ["5月", 2, 3500]]);
check("日付不明バケット", [agg[2].count, agg[2].total], [1, 800]);

renderResult(results, 3);
check("合計表示(金額取得失敗を除外)", document.getElementById("totalAmount").textContent, "¥7,800");
check("対象注文数", document.getElementById("totalCount").textContent, "対象注文数: 5件");
check("除外と失敗の内訳", document.getElementById("skippedCount").textContent, "除外(キャンセル): 3件 / 金額取得失敗: 1件");
check("結果ボックスが表示される", document.getElementById("result").hidden, false);

const yearRows = [...periodTableBody.querySelectorAll(".year-row")];
const monthRows = [...periodTableBody.querySelectorAll(".month-row")];
check("年行の数", yearRows.length, 3);
check("月行の数", monthRows.length, 4);
check("初期状態で月行は畳まれている", monthRows.every(r => r.hidden), true);

yearRows[0].querySelector(".toggle").click();
const y2024Months = [...periodTableBody.querySelectorAll('.month-row[data-year-key="2024"]')];
check("2024年クリックで展開", y2024Months.every(r => !r.hidden), true);
check("他の年は畳まれたまま", [...periodTableBody.querySelectorAll('.month-row[data-year-key="2023"]')].every(r => r.hidden), true);
check("トグル記号が開いた状態", yearRows[0].querySelector(".toggle").textContent, "▾");
yearRows[0].click();
check("再クリックで閉じる", y2024Months.every(r => r.hidden), true);

check("内訳の並び順", [...orderTableBody.querySelectorAll("tr")].map(tr => tr.cells[3].textContent),
  ["c", "b", "a", "f", "d", "e"]);
check("取得失敗の表示", [...orderTableBody.querySelectorAll("tr")].find(tr => tr.cells[3].textContent === "f").cells[2].textContent, "取得失敗");
check("ステータス日本語化", [...orderTableBody.querySelectorAll("tr")].find(tr => tr.cells[3].textContent === "b").cells[1].textContent, "支払済み");

renderResult([{ id: "<img src=x onerror=alert(1)>", date: "2024-01-01", status: "completed", amount: 1 }], 0);
check("HTMLエスケープ", orderTableBody.querySelector("tr").cells[3].querySelector("img"), null);

setTimeout(() => {
  document.getElementById("out").textContent =
    lines.join("\n") + `\n\n---- ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (${lines.length} checks) ----`;
}, 800);
