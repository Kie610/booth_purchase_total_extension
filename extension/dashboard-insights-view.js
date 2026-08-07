"use strict";

// 推し作者ランキング、今年のまとめ、支出推移・時間帯ヒートマップの表示。
// 共通のDOM組み立てと集計結果は dashboard-view.js / common.js を利用する。

// ---- 推し作者ランキング ------------------------------------------------

// 上位何位まで出すか。王冠を付ける順位と、太字にする順位
const RANKING_LIMIT = 10;
const RANKING_CROWNS = 3;
const RANKING_BOLD = 5;

// 金額編・購入数編のどちらで並べているか。再描画で作り直す表には残せないので
// ここで持つ(開いている年の集合と同じ扱い)
let rankingSort = DEFAULT_SHOP_SORT;

function setRankingSort(sort) {
  if (!SHOP_SORTS[sort] || sort === rankingSort) return;
  rankingSort = sort;
  renderRankingArea();
  updateShareButton();
}

// 数量の左に小さく添えるギフト表記。金額のセルと置き方をそろえる
function countCell(count, giftCount) {
  const cell = td("", "num");
  if (giftCount > 0) cell.appendChild(el("span", "gift", giftCountText(giftCount)));
  cell.appendChild(document.createTextNode(`${count}点`));
  return cell;
}

// ショップ名。BOOTHのショップURLが取れていればリンクにする
// (URLは取得したHTML由来なので、booth.pm のものだけを通す)
const SHOP_URL_PATTERN = /^https:\/\/[\w-]+\.booth\.pm\/?$/;

function shopNameCell(row) {
  const cell = td("");
  if (SHOP_URL_PATTERN.test(row.url)) {
    const link = el("a", null, row.name);
    link.href = row.url;
    link.target = "_blank";
    link.rel = "noopener";
    cell.appendChild(link);
  } else {
    cell.textContent = row.name;
  }
  return cell;
}

function rankCell(rank, expanded, detailsId, shopName) {
  const cell = td("", "rank");
  const button = el("button", "table-toggle rank-toggle");
  button.type = "button";
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-controls", detailsId);
  button.setAttribute("aria-label", `${shopName}の商品明細を${expanded ? "閉じる" : "開く"}`);
  const badge = el("span", "rank-badge", String(rank));
  // 1〜3位は王冠を背景に敷く(金・銀・銅)
  if (rank <= RANKING_CROWNS) badge.classList.add(`rank-crown-${rank}`);
  button.appendChild(badge);
  // 何が買えるのか押す前に分かるよう、開閉できることを三角で示す
  button.appendChild(el("span", "toggle", expanded ? "▾" : "▸"));
  cell.appendChild(button);
  return cell;
}

// 押されている基準のボタンと、その基準で並べている列に印を付ける
function renderRankingSortToggle() {
  rankingSortToggle.querySelectorAll(".segmented-btn").forEach((btn) => {
    const on = btn.dataset.sort === rankingSort;
    btn.classList.toggle("current", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  rankingTableBody
    .closest("table")
    .querySelectorAll("th[data-sort]")
    .forEach((th) => th.classList.toggle("sorted", th.dataset.sort === rankingSort));
}

function renderRankingArea() {
  const results = buildResults();
  const shops = aggregateByShop(results, rankingSort);
  renderRankingSortToggle();
  rankingEmpty.hidden = shops.length > 0;
  rankingArea.hidden = shops.length === 0;
  // 共有できるのは画面に出している順位そのもの。取り違えが起きないよう、
  // 描画に使ったものをそのまま共有側へ渡す
  rankingShareStats = buildRankingShareStats(results, shops);
  if (shops.length === 0) {
    rankingTableBody.innerHTML = "";
    return;
  }

  const shown = shops.slice(0, RANKING_LIMIT);
  rankingStats.textContent =
    `ショップ: ${shops.length}件` +
    (shops.length > shown.length ? ` (上位${shown.length}件を表示)` : "");

  // 金額を読めなかった商品を0として足すと、少ない額を正しい合計に見せてしまう
  const unknown = shops.reduce((sum, row) => sum + row.unknown, 0);
  rankingUnknown.hidden = unknown === 0;
  if (unknown > 0) {
    rankingUnknown.textContent =
      `金額を読み取れなかった商品が${unknown}点あります。その分は合計額に入っていません。`;
  }

  renderShopRows(rankingTableBody, shown, RANKING_BOLD);
}

// 順位をクリックすると、そのショップで買った商品が下に開く。
// 開いているショップは表を作り直しても保つ(並べ替えのたびに閉じると探し直しになる)
const expandedShopKeys = new Set();

// ランキングとまとめで同じ形の行を出す。片方だけ列や飾りが違うと、
// 見比べたときに別のものを数えているように見える
function renderShopRows(tbody, shops, boldUntil) {
  tbody.innerHTML = "";
  shops.forEach((row, index) => {
    const expanded = expandedShopKeys.has(row.key);
    const detailsId = `${tbody.id}-shop-details-${index}`;
    const tr = el("tr", index < boldUntil ? "shop-row rank-top" : "shop-row");
    tr.dataset.shopKey = row.key;
    tr.appendChild(rankCell(index + 1, expanded, detailsId, row.name));
    tr.appendChild(shopNameCell(row));
    tr.appendChild(countCell(row.count, row.giftCount));
    tr.appendChild(amountCell(row.total, row.gift));
    tbody.appendChild(tr);
    const itemsRow = shopItemsRow(row, expanded);
    itemsRow.id = detailsId;
    tbody.appendChild(itemsRow);
  });
}

// 同じ商品を複数の注文で買っていると重複するので、名前でまとめたものを出す
// (集合にする側は aggregateByShop が担う)
function shopItemsRow(row, expanded) {
  const tr = el("tr", "shop-items-row");
  tr.dataset.shopKey = row.key;
  tr.hidden = !expanded;

  const cell = td("", "shop-items");
  cell.colSpan = 4;
  if (row.items.length === 0) {
    cell.appendChild(el("span", "hint", "商品の明細がありません"));
  } else {
    const list = el("ul", "shop-item-list");
    for (const name of row.items) list.appendChild(el("li", "", name));
    cell.appendChild(list);
    cell.appendChild(el("span", "hint", `${row.items.length}種類`));
  }
  tr.appendChild(cell);
  return tr;
}

// ランキングとまとめの両方に同じショップが出るので、開閉は表をまたいで反映する。
// 片方だけ開くと、行き来したときに開いたはずのものが閉じて見える
function toggleShopItems(key) {
  const expanded = expandedShopKeys.has(key);
  if (expanded) {
    expandedShopKeys.delete(key);
  } else {
    expandedShopKeys.add(key);
  }
  const selector = `[data-shop-key="${CSS.escape(key)}"]`;
  document.querySelectorAll(`tr.shop-items-row${selector}`).forEach((tr) => {
    tr.hidden = expanded;
  });
  document.querySelectorAll(`tr.shop-row${selector} .rank-toggle`).forEach((button) => {
    button.querySelector(".toggle").textContent = expanded ? "▸" : "▾";
    button.setAttribute("aria-expanded", String(!expanded));
    const shopName = button.getAttribute("aria-label").replace(/の商品明細を(?:開く|閉じる)$/, "");
    button.setAttribute("aria-label", `${shopName}の商品明細を${expanded ? "開く" : "閉じる"}`);
  });
}

// ---- 今年のまとめ ------------------------------------------------------

// 選んでいる年。注文の無い年は選べないので、描画のたびに実在する年へ寄せる
let summarySelectedYear = null;

function setSummaryYear(year) {
  const value = Number(year);
  if (!Number.isFinite(value) || value === summarySelectedYear) return;
  summarySelectedYear = value;
  renderYearSummary();
  // 共有ボタンには年が入っているので、選び直したら文言も追従させる
  updateShareButton();
}

// 1月に見ると去年を振り返りたいので、今年に注文が無ければ最も新しい年へ落とす
function resolveSummaryYear(years) {
  if (years.includes(summarySelectedYear)) return summarySelectedYear;
  const thisYear = new Date().getFullYear();
  return years.includes(thisYear) ? thisYear : years[0];
}

// 年を選ぶプルダウンは、まとめと支出推移の両方で使う。
// 中身が同じなら作り直さない(開いたまま再描画すると選択が閉じてしまう)
function renderYearOptions(select, years, selected) {
  const same =
    select.options.length === years.length &&
    years.every((year, index) => select.options[index].value === String(year));
  if (!same) {
    select.innerHTML = "";
    for (const year of years) {
      select.appendChild(el("option", "", `${year}年`)).value = String(year);
    }
  }
  select.value = String(selected);
}

function renderYearSummary() {
  const results = buildResults();
  const years = orderYears(results);
  summaryEmpty.hidden = years.length > 0;
  summaryArea.hidden = years.length === 0;
  if (years.length === 0) {
    summaryCards.innerHTML = "";
    summaryTopShopsBody.innerHTML = "";
    summaryShareStats = null;
    return;
  }

  summarySelectedYear = resolveSummaryYear(years);
  renderYearOptions(summaryYear, years, summarySelectedYear);
  const stats = buildYearSummary(results, summarySelectedYear);
  // 共有するのは画面に出したものそのもの。共有時に集計し直さない
  summaryShareStats = stats;

  // 未収集はまとめの数字を実際より少なくする。合計のすぐ横で断る
  const totalNote = [`注文${stats.orderCount}件`];
  if (stats.gift > 0) totalNote.push(`ギフト ${formatYen(stats.gift)}`);
  if (stats.pendingCount > 0) totalNote.push(`未収集${stats.pendingCount}件`);
  if (stats.detailPendingCount > 0) {
    totalNote.push(`商品明細未収集${stats.detailPendingCount}件`);
  }

  const cards = [
    [`${stats.year}年の合計額`, formatYen(stats.total), totalNote.join(" / ")],
    ["買ったもの", `${stats.itemCount}点`, giftCountText(stats.giftItemCount)],
    [
      "支援した作者",
      `${stats.shopCount}人`,
      stats.newShopCount > 0 ? `はじめて ${stats.newShopCount}人` : "",
    ],
  ];
  if (stats.busiestMonth) {
    cards.push([
      "いちばん買った月",
      monthLabel(stats.busiestMonth.key),
      formatYen(stats.busiestMonth.total),
    ]);
  }
  summaryCards.innerHTML = "";
  for (const [label, value, note] of cards) {
    summaryCards.appendChild(statCard(label, value, note));
  }

  // 現在年の明細不足は点数・作者数・順位を少なくし、過去の明細不足は
  // 以前から買っていた作者を「はじめて」と数える。どちらも数字の近くで断る。
  const summaryWarnings = [];
  if (stats.detailPendingCount > 0) {
    summaryWarnings.push(
      `${stats.year}年の注文に商品明細の未収集が${stats.detailPendingCount}件あります。` +
        "点数・作者数・推し作者は実際より少なくなることがあります。"
    );
  }
  if (stats.beforePending > 0) {
    summaryWarnings.push(
      `${stats.year}年より前の注文に未収集が${stats.beforePending}件あります。` +
        "その注文で買った作者は「はじめて」に数えてしまうことがあります。"
    );
  }
  summaryNewShopWarn.hidden = summaryWarnings.length === 0;
  summaryNewShopWarn.textContent = summaryWarnings.join(" ");

  renderShopRows(summaryTopShopsBody, stats.topShops, stats.topShops.length);
}

function statCard(label, value, note, className) {
  const card = el("div", `stat-card${className ? ` ${className}` : ""}`);
  card.appendChild(el("span", "stat-label", label));
  card.appendChild(el("strong", "stat-value", value));
  if (note) card.appendChild(el("span", "stat-note", note));
  return card;
}

function barHeight(amount, max) {
  if (amount <= 0 || max <= 0) return 0;
  return Math.max(3, (amount / max) * 100);
}

// 棒グラフの縦軸。累計グラフ(renderCumulativeChart)と同じく 0 / 50% / 最大値 の
// 3段だけを出す。title属性のツールチップはホバーできない環境では読めないため、
// 目盛が無いと棒の高さから金額を推し量る手段がまったく無くなる。
// 位置はCSS側のクラス(.axis-top / .axis-mid / .axis-bottom)で棒の描画域に合わせる
function renderMonthlyTrendAxis(max) {
  monthlyTrendAxis.innerHTML = "";
  const ceiling = max > 0 ? max : 0;
  for (const [className, ratio] of [
    ["axis-top", 1],
    ["axis-mid", 0.5],
    ["axis-bottom", 0],
  ]) {
    monthlyTrendAxis.appendChild(
      el("span", `trend-axis-tick ${className}`, formatYen(Math.round(ceiling * ratio)))
    );
  }
}

function svgEl(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    node.setAttribute(name, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function trendPoints(months, key, max, limit = 12) {
  const left = 48;
  const top = 24;
  const width = 640;
  const height = 176;
  const ceiling = max || 1;
  return months
    .slice(0, limit)
    .map((month, index) => {
      const x = left + (width * index) / 11;
      const y = top + height - (height * month[key]) / ceiling;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderCumulativeChart(trend) {
  cumulativeTrendChart.innerHTML = "";
  cumulativeTrendChart.setAttribute(
    "aria-label",
    `${trend.year}年と${trend.baseYear}年の年間累計支出`
  );
  cumulativeTrendChart.appendChild(
    svgEl("title", {}, `${trend.year}年と${trend.baseYear}年の年間累計支出`)
  );

  const gridValues = [0, 0.5, 1];
  for (const ratio of gridValues) {
    const y = 200 - 176 * ratio;
    cumulativeTrendChart.appendChild(
      svgEl("line", { x1: 48, y1: y, x2: 688, y2: y, class: "trend-grid-line" })
    );
    cumulativeTrendChart.appendChild(
      svgEl(
        "text",
        { x: 42, y: y + 4, class: "trend-axis-value", "text-anchor": "end" },
        formatYen(Math.round(trend.maxCumulative * ratio))
      )
    );
  }

  for (let index = 0; index < 12; index++) {
    const x = 48 + (640 * index) / 11;
    cumulativeTrendChart.appendChild(
      svgEl("text", { x, y: 226, class: "trend-axis-month", "text-anchor": "middle" }, index + 1)
    );
  }

  cumulativeTrendChart.appendChild(
    svgEl("polyline", {
      class: "trend-line previous",
      points: trendPoints(trend.months, "previousCumulative", trend.maxCumulative),
    })
  );
  cumulativeTrendChart.appendChild(
    svgEl("polyline", {
      class: "trend-line current",
      points: trendPoints(
        trend.months,
        "currentCumulative",
        trend.maxCumulative,
        trend.throughMonth
      ),
    })
  );
}

// 比較する2つの年。null は「まだ選んでいない(既定に任せる)」
let trendSelectedYear = null;
let trendSelectedBaseYear = null;

// 既定は今年と前年。注文が無い年は選べないので、実在する年へ寄せる
function resolveTrendYears(years, thisYear) {
  const year = years.includes(trendSelectedYear)
    ? trendSelectedYear
    : years.includes(thisYear)
      ? thisYear
      : years[0];
  const others = years.filter((candidate) => candidate !== year);
  const base = others.includes(trendSelectedBaseYear)
    ? trendSelectedBaseYear
    : others.includes(year - 1)
      ? year - 1
      : others[0];
  // 比べる相手が1つも無い(1年分しか買っていない)ときは前年を空として扱う
  return [year, base === undefined ? year - 1 : base];
}

function setTrendYears(year, baseYear) {
  trendSelectedYear = Number(year);
  trendSelectedBaseYear = Number(baseYear);
  renderSpendingTrends();
}

function renderSpendingTrends(now = new Date()) {
  const results = buildResults();
  const valid = results.filter((result) => typeof result.amount === "number");
  trendsEmpty.hidden = valid.length > 0;
  trendsArea.hidden = valid.length === 0;
  if (valid.length === 0) {
    trendSummary.innerHTML = "";
    monthlyTrendAxis.innerHTML = "";
    monthlyTrendChart.innerHTML = "";
    cumulativeTrendChart.innerHTML = "";
    trendPeriodTableBody.innerHTML = "";
    return;
  }

  const years = orderYears(results);
  const [year, baseYear] = resolveTrendYears(years, now.getFullYear());
  renderYearOptions(trendYear, years, year);
  // 同じ年どうしを比べても意味がないので、選んでいる年は相手側から外す
  renderYearOptions(
    trendBaseYear,
    years.filter((candidate) => candidate !== year),
    baseYear
  );

  // 今年は途中までしか買っていないので今月で切る。過ぎた年は12月まで見る
  const throughMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const trend = buildSpendingTrend(results, year, throughMonth, baseYear);
  trendCurrentYearLabel.textContent = `${trend.year}年`;
  trendPreviousYearLabel.textContent = `${trend.baseYear}年`;

  trendSummary.innerHTML = "";
  trendSummary.appendChild(
    statCard(
      `${trend.year}年 1〜${trend.throughMonth}月`,
      formatYen(trend.currentToDate),
      "収集済みの合計額"
    )
  );
  trendSummary.appendChild(
    statCard(
      `${trend.baseYear}年 同期間`,
      formatYen(trend.previousToDate),
      `${trend.baseYear}年の1月から同じ月まで`
    )
  );
  const differenceClass =
    trend.difference > 0 ? "increase" : trend.difference < 0 ? "decrease" : "";
  const differenceText =
    trend.difference > 0
      ? `+${formatYen(trend.difference)}`
      : trend.difference < 0
        ? `-${formatYen(Math.abs(trend.difference))}`
        : formatYen(0);
  const rateText =
    trend.rate === null
      ? `${trend.baseYear}年の同期間が0円のため割合は算出できません`
      : `同期間比 ${trend.rate > 0 ? "+" : ""}${trend.rate.toFixed(1)}%`;
  trendSummary.appendChild(
    statCard(`${trend.baseYear}年との差`, differenceText, rateText, differenceClass)
  );

  renderMonthlyTrendAxis(trend.maxMonthly);
  monthlyTrendChart.innerHTML = "";
  monthlyTrendChart.setAttribute(
    "aria-label",
    `${trend.year}年と${trend.baseYear}年の月ごとの支出比較`
  );
  for (const month of trend.months) {
    const group = el("div", "trend-month");
    const bars = el("div", "trend-bar-pair");
    for (const [key, label] of [
      ["current", `${trend.year}年${month.month}月`],
      ["previous", `${trend.baseYear}年${month.month}月`],
    ]) {
      const bar = el("span", `trend-bar ${key}`);
      bar.style.height = `${barHeight(month[key], trend.maxMonthly)}%`;
      bar.title = `${label}: ${formatYen(month[key])}`;
      bar.setAttribute("aria-label", bar.title);
      bars.appendChild(bar);
    }
    group.appendChild(bars);
    group.appendChild(el("span", "trend-month-label", `${month.month}月`));
    monthlyTrendChart.appendChild(group);
  }

  renderCumulativeChart(trend);
  // 左で選んでいる年へ合わせてから描く
  syncHeatmapToYear(trend.year);
  renderHeatmap();
  renderPeriodTableInto(
    trendPeriodTableBody,
    aggregateByPeriod(results),
    expandedTrendPeriodYears
  );
}

// ---- 買った曜日と時間帯 ------------------------------------------------

// 選んでいる範囲。null は「全期間」
let heatmapFromKey = null;
let heatmapToKey = null;

// **比較する年を切り替えたら、この区画も同じ期間へ合わせる。**
// 別々に動くと、上のグラフが2025年なのに下は全期間、という食い違ったものを
// 並べて見比べることになる。合わせたあとに範囲や「全期間」を選び直せば
// そちらが残るので、年を切り替えたときだけ上書きする(同じ年での再描画では
// 触らない。収集が進むたびに手で選んだ範囲が戻ってしまう)
let heatmapSyncedYear = null;

function syncHeatmapToYear(year) {
  if (heatmapSyncedYear === year) return;
  heatmapSyncedYear = year;
  // **今年でも今月で切らず、1年間で見る。** ここで数えるのは曜日と時間帯の
  // 傾向なので、月をそろえる意味がない(上の年比較は金額を足し合わせるため、
  // 同じ月まででないと差が出てしまうので、あちらだけ今月で切る)。
  // その年に注文の無い月は clampMonthKey が実在する範囲へ寄せる
  heatmapFromKey = `${year}-01`;
  heatmapToKey = `${year}-12`;
}

function setHeatmapRange(from, to) {
  // 逆に選んでも同じ範囲として扱う(範囲指定の他の場所と同じ)
  heatmapFromKey = from && to && from > to ? to : from;
  heatmapToKey = from && to && from > to ? from : to;
  renderHeatmap();
}

function heatmapMonthKeys(results) {
  const keys = new Set();
  for (const result of results) {
    const key = monthKeyOf(result.date);
    if (key) keys.add(key);
  }
  return Array.from(keys).sort();
}

// 選択肢には**注文のある月しか無い**。年に合わせて 1月〜12月 を指定しても
// その月の注文が無ければ選べないので、範囲に入る最も近い月へ寄せる。
// 寄せずに渡すと select の値が空になり、件数が0件として出てしまう
function clampMonthKey(key, keys, edge) {
  if (!key) return edge === "from" ? keys[0] : keys[keys.length - 1];
  if (keys.includes(key)) return key;
  const inside =
    edge === "from"
      ? keys.find((candidate) => candidate >= key)
      : keys.filter((candidate) => candidate <= key).pop();
  // 範囲の中に1か月も無いときは端へ倒す(年の選択肢は注文のある年だけなので
  // 通常は起きないが、寄せ先が無いまま空を渡すよりは全期間の端が分かりやすい)
  return inside || (edge === "from" ? keys[0] : keys[keys.length - 1]);
}

function renderHeatmapRangeOptions(keys) {
  for (const [select, selected] of [
    [heatmapFrom, clampMonthKey(heatmapFromKey, keys, "from")],
    [heatmapTo, clampMonthKey(heatmapToKey, keys, "to")],
  ]) {
    const same =
      select.options.length === keys.length &&
      keys.every((key, index) => select.options[index].value === key);
    if (!same) {
      select.innerHTML = "";
      for (const key of keys) {
        select.appendChild(el("option", "", monthLabel(key))).value = key;
      }
    }
    select.value = selected;
  }
}

// 濃さは最大の回数を基準にする。1件でも薄く色を付けて、0件と見分けられるようにする
function heatmapCellAlpha(count, max) {
  if (count === 0) return 0;
  return 0.15 + (count / max) * 0.85;
}

function renderHeatmap() {
  const results = buildResults();
  const keys = heatmapMonthKeys(results);
  if (keys.length === 0) {
    heatmapGrid.innerHTML = "";
    heatmapEmpty.hidden = false;
    heatmapStats.textContent = "";
    heatmapSkipped.hidden = true;
    return;
  }
  renderHeatmapRangeOptions(keys);

  const stats = buildWeekdayHourStats(results, heatmapFrom.value, heatmapTo.value);
  heatmapEmpty.hidden = stats.counted > 0;
  heatmapGrid.hidden = stats.counted === 0;
  heatmapStats.textContent = stats.counted > 0 ? `${stats.counted}件` : "";
  heatmapSkipped.hidden = stats.skipped === 0;
  if (stats.skipped > 0) {
    heatmapSkipped.textContent =
      `注文日時から曜日または時刻を読み取れなかった注文が${stats.skipped}件あります。` +
      "この表には入っていません。";
  }
  if (stats.counted === 0) {
    heatmapGrid.innerHTML = "";
    return;
  }

  heatmapGrid.setAttribute(
    "aria-label",
    `曜日と時間帯ごとの注文件数(${monthLabel(heatmapFrom.value)}〜${monthLabel(heatmapTo.value)}、${stats.counted}件)`
  );
  heatmapGrid.innerHTML = "";
  // 左上は曜日の列の見出し分
  heatmapGrid.appendChild(el("span", "heatmap-corner"));
  for (let hour = 0; hour < 24; hour += 1) {
    // 24個すべて数字を出すと潰れるので、3時間おきに目印を置く
    heatmapGrid.appendChild(el("span", "heatmap-hour", hour % 3 === 0 ? String(hour) : ""));
  }
  stats.cells.forEach((row, weekday) => {
    heatmapGrid.appendChild(el("span", "heatmap-weekday", WEEKDAY_LABELS[weekday]));
    row.forEach((count, hour) => {
      const cell = el("span", "heatmap-cell");
      cell.style.backgroundColor = `rgba(252, 77, 80, ${heatmapCellAlpha(count, stats.max)})`;
      cell.title = `${WEEKDAY_LABELS[weekday]}曜 ${hour}時台: ${count}件`;
      heatmapGrid.appendChild(cell);
    });
  });
}
