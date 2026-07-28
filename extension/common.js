"use strict";

// Chromiumを主対象にしつつ、Firefoxの一時読み込みでも使えるAPI名へ寄せる簡易ラッパー
const ext = typeof browser !== "undefined" ? browser : chrome;

// { [orderId]: { amount, gift, status, date, items: [{ shop, shopUrl, name, price, boost, gift }] } }
const CACHE_KEY = "boothOrderCache";
const INDEX_KEY = "boothOrderIndex"; // { updatedAt, orders: [{ id, status, date }] }
const SUMMARY_KEY = "boothSummary"; // 最後に完了した集計の要約(ポップアップ表示用)
const RUN_STATE_KEY = "boothRunState"; // 実行中の進捗(ポップアップから覗くため)
const DASHBOARD_TAB_KEY = "boothDashboardTab"; // 集計ページのタブID

const STATUS_LABELS = {
  completed: "発送完了",
  paid: "支払済み",
  unpaid: "未払い",
  cancelled: "キャンセル",
  unknown: "不明",
};

function formatYen(n) {
  return `¥${Number(n).toLocaleString("ja-JP")}`;
}

// 支払額に含まれるギフト分。取得できていない注文では0として扱う
function giftAmount(entry) {
  return entry && typeof entry.gift === "number" ? entry.gift : 0;
}

// ---- 商品明細 ----------------------------------------------------------
//
// 注文は「ショップ名・商品名・単価・BOOST・ギフトかどうか」を持つ商品の集まりとして
// 保存する。合計や年別月別の集計は引き続き注文単位の「お支払金額」から出し、
// 商品の合計では代用しない(送料やクーポンが絡む注文で一致する保証が無いため)。
// 両者の差は「データ出力」のCSVで確認できるようにしてある。

function hasItems(entry) {
  return Boolean(entry) && Array.isArray(entry.items);
}

// ---- キャッシュの版数 --------------------------------------------------
//
// 注文詳細ページから「何を保存したか」を注文ごとに記録する。保存済みのデータを
// 見て欠落を推測する方式は採らない。例えばv0.15.0が保存した
// 「ダウンロード商品だけの注文(正しい)」と「配送商品が欠けた混在注文(欠落あり)」は、
// どちらも quantity と shipping を持たないため、形がまったく同じで区別できない。
// 索引の complete と同じで、記録しておく方が同じ情報で確実になる。
//
// 版数は注文ごとに持つ。ストレージ全体に1つだと途中まで取り直した状態を表せず、
// 中断のたびに全件やり直しになる。
//
// **上げてよいのは、注文詳細ページから保存する項目が増えたときだけ。**
// 表示や集計の変更で上げると、無関係な再取得を全ユーザーに強いることになる。
//
//   1 — 商品明細(shop/shopUrl/name/price/quantity/boost/gift)と送料
//       v0.15.0以前は版数を持たず、配送商品の行と送料と数量が欠けている
const CACHE_SCHEMA_VERSION = 1;

function entrySchemaVersion(entry) {
  return entry && typeof entry.v === "number" ? entry.v : 0;
}

// 新しい版で保存されたものは取り直さない(バックアップの復元で、この環境より
// 新しい版のデータが入ってくることがある)
function isOutdatedEntry(entry) {
  return entrySchemaVersion(entry) < CACHE_SCHEMA_VERSION;
}

// 数量の行はデジタル商品の注文には無い。無ければ1個として数える
function itemQuantity(item) {
  return item.quantity === undefined ? 1 : item.quantity;
}

// 商品1件分の金額は「単価×数量」にBOOSTを足したもの。BOOSTは行に1つ付くものとして
// 数量を掛けない(数量が2以上でBOOSTのある注文をまだ実測できていない。
// 掛け方を誤っていればお支払金額との差額に出る)。
// 価格や数量を読めていなければ0と断定せず不明(null)にする
function itemAmount(item) {
  const quantity = itemQuantity(item);
  if (typeof item.price !== "number" || typeof quantity !== "number") return null;
  return item.price * quantity + (typeof item.boost === "number" ? item.boost : 0);
}

// 1件でも読めていなければ、足りない分を0として扱うと
// 少ない額を正しい合計に見せてしまうので不明(null)にする
function sumItemAmounts(items) {
  if (!Array.isArray(items)) return null;
  let total = 0;
  for (const item of items) {
    const amount = itemAmount(item);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}

// ギフトのグループに置かれていた商品の合計。明細そのものが無ければ不明
function giftTotalOfItems(items) {
  if (!Array.isArray(items)) return null;
  return sumItemAmounts(items.filter((item) => item.gift));
}

function itemsTotalOf(entry) {
  return hasItems(entry) ? sumItemAmounts(entry.items) : null;
}

// 配送のある注文に付く送料。取得できていない注文では0として扱う
function shippingAmount(entry) {
  return entry && typeof entry.shipping === "number" ? entry.shipping : 0;
}

// お支払金額から、商品合計と送料を引いた残り。クーポンやポイントなど、
// まだ拾えていないものがあればここに出る。
// お支払金額か商品合計が不明なら差も出さない
function amountGapOf(entry) {
  const items = itemsTotalOf(entry);
  if (items === null || !entry || typeof entry.amount !== "number") return null;
  return entry.amount - items - shippingAmount(entry);
}

// まだ取りに行く必要がある注文かどうか。キャッシュに無いもの(未収集)に加え、
// 取得はできたが金額を読めなかったもの(amount:null)、商品明細を読めなかったもの、
// 保存する項目が増える前の版で保存されたものも対象にする。
// 対象から外すと強制再取得でしか拾い直せず、内訳に「取得失敗」と出たまま直す手段が
// 全件再取得しかなくなるため、次の実行で自動的に取り直せるようにする
function needsCollect(entry) {
  return (
    !entry ||
    entry.amount === null ||
    !hasItems(entry) ||
    isOutdatedEntry(entry)
  );
}

// 索引が最古の注文まで到達できているか。
// v1.2以前はフラグを持たないが、全ページの巡回に成功したときだけ索引を保存していたため
// 「最古まで取得済み」として扱ってよい
function indexIsComplete(index) {
  return Boolean(index) && index.complete !== false;
}

// 支払額の左に小さく添えるギフト表記(0のときは何も出さない)
function giftText(total) {
  return total > 0 ? `ギフト ${formatYen(total)}` : "";
}

// 件数の左に添えるギフト表記。金額と同じ置き方にそろえる
function giftCountText(count) {
  return count > 0 ? `ギフト ${count}点` : "";
}

// ポップアップの件数行。取得失敗だけは要対処なので色を分けて出したく、
// 別の要素にする必要があるため文面を分けて返す
function summaryCounts(summary) {
  return {
    text:
      `収集済み: ${summary.count}件` +
      (summary.pendingCount ? ` / 未収集: ${summary.pendingCount}件` : "") +
      (summary.skippedCancelled
        ? ` / 除外(キャンセル): ${summary.skippedCancelled}件`
        : ""),
    failed: summary.failedCount ? ` / 取得失敗: ${summary.failedCount}件` : "",
  };
}

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP");
}

// BOOTHの注文日時は表記が変わりうるため、
// "2024年5月3日 12:34" / "2024/05/03" / "2024-05-03" のいずれも受け付ける
function parseOrderDate(text) {
  if (!text) return null;
  const m = String(text).match(
    /(\d{4})\s*[-/年.]\s*(\d{1,2})(?:\s*[-/月.]\s*(\d{1,2}))?/
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 0;
  if (month < 1 || month > 12) return null;
  // 時刻は一覧ページに「12:34」の形で並ぶ。無い表記もありうるので必須にしない
  const time = String(text).match(/(\d{1,2}):(\d{2})/);
  const hour = time && Number(time[1]) < 24 ? Number(time[1]) : null;
  return { year, month, day, hour, sortKey: year * 10000 + month * 100 + day };
}

// 曜日(0=日)。日が読めていないと決められないので null を返す。
// 曜日はUTCで数える。ローカル時間で作ると、環境によって1日ずれることがある
function orderWeekday(date) {
  if (!date || !date.day) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

// 日付が読めなかった注文は末尾へ送る
function orderSortKey(order) {
  const d = parseOrderDate(order.date);
  return d ? d.sortKey : -1;
}

// ---- 期間(年・月)のまとめ ----------------------------------------------
//
// 期間キーは "YYYY-MM"(月) / "YYYY"(年) の文字列で統一する。0埋めしてあるので
// 文字列比較がそのまま日付の前後関係になり、範囲指定の比較にもそのまま使える。
// 日付を読み取れなかった注文のキーは null。

function monthKeyOf(dateText) {
  const d = parseOrderDate(dateText);
  return d ? `${d.year}-${String(d.month).padStart(2, "0")}` : null;
}

function yearKeyOf(monthKey) {
  return monthKey ? monthKey.slice(0, 4) : null;
}

function yearLabel(key) {
  return key ? `${Number(key)}年` : "日付不明";
}

function monthLabel(key) {
  if (!key) return "日付不明";
  const [year, month] = key.split("-");
  return `${Number(year)}年${Number(month)}月`;
}

// 年の行にぶら下げるときの月表記(年は親の行に出ているので省く)
function monthShortLabel(key) {
  return key ? `${Number(key.slice(5))}月` : "月不明";
}

// 新しい順。日付不明(null)は並びの末尾へ送る
function comparePeriodDesc(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

// 注文を「年 → 月」の二段階にまとめる共通処理。
// 行に何を積むかは呼び出し側が seed(行の初期値)と add(1件分の反映)で決める。
// 「収集状況を数える」用途と「支払額を合計する」用途の両方がこれを使う。
function groupByPeriod(items, dateOf, seed, add) {
  const years = new Map();
  for (const item of items) {
    const monthKey = monthKeyOf(dateOf(item));
    const yearKey = yearKeyOf(monthKey);
    if (!years.has(yearKey)) {
      years.set(yearKey, {
        key: yearKey,
        label: yearLabel(yearKey),
        months: new Map(),
        ...seed(),
      });
    }
    const year = years.get(yearKey);
    add(year, item);

    if (!year.months.has(monthKey)) {
      year.months.set(monthKey, {
        key: monthKey,
        label: monthLabel(monthKey),
        shortLabel: monthShortLabel(monthKey),
        ...seed(),
      });
    }
    add(year.months.get(monthKey), item);
  }
  return Array.from(years.values())
    .sort((a, b) => comparePeriodDesc(a.key, b.key))
    .map((year) => ({
      ...year,
      months: Array.from(year.months.values()).sort((a, b) =>
        comparePeriodDesc(a.key, b.key)
      ),
    }));
}

// 年ごと・月ごとの「注文数 / 収集済み / 未収集」(新しい年が先、日付不明は末尾)
function buildYearStats(orders, cache) {
  const withPending = (row) => ({ ...row, pending: row.count - row.collected });
  return groupByPeriod(
    orders,
    (order) => order.date,
    () => ({ count: 0, collected: 0 }),
    (row, order) => {
      row.count++;
      // 取得失敗は再取得の対象なので、ここでも未収集として数える
      // (数え方が pendingTargets とずれると「取得予定」の件数と食い違う)
      if (!needsCollect(cache[order.id])) row.collected++;
    }
  ).map((year) => ({ ...withPending(year), months: year.months.map(withPending) }));
}

// 月だけの平坦な一覧(範囲の選択肢や未収集の検出に使う)。年のまとまりを開くだけ
function buildMonthStats(orders, cache) {
  return buildYearStats(orders, cache).flatMap((year) => year.months);
}

// 年 → 月 の二段階で支払額を集計する(収集済みの注文のみ)
function aggregateByPeriod(results) {
  return groupByPeriod(
    results.filter((r) => typeof r.amount === "number"),
    (r) => r.date,
    () => ({ count: 0, total: 0, gift: 0 }),
    (row, r) => {
      row.count++;
      row.total += r.amount;
      row.gift += giftAmount(r);
    }
  );
}

// 2つの年の月別支出・累計を、グラフと要約の両方で使える形にする。
// 画面側で集計し直すと、表とグラフで対象条件がずれるため、ここで一度だけ
// 「金額を収集できた注文」を同じ基準でまとめる。
//
// 比べる相手は既定では前年だが、任意の年を選べる(2年前と見比べたいことがある)。
// 同じ年を2つ渡すと比較対象が空になり差が全額になってしまうので、
// 画面側で同じ年を選べないようにしてある。
function buildSpendingTrend(
  results,
  year = new Date().getFullYear(),
  throughMonth = new Date().getMonth() + 1,
  compareYear = Number(year) - 1
) {
  const currentYear = Number(year);
  const baseYear = Number(compareYear);
  const cutoff = Math.min(12, Math.max(1, Number(throughMonth) || 1));
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    current: 0,
    previous: 0,
    currentCumulative: 0,
    previousCumulative: 0,
  }));

  for (const result of results) {
    if (typeof result.amount !== "number") continue;
    const date = parseOrderDate(result.date);
    if (!date) continue;
    if (date.year !== currentYear && date.year !== baseYear) continue;
    const key = date.year === currentYear ? "current" : "previous";
    months[date.month - 1][key] += result.amount;
  }

  let currentCumulative = 0;
  let previousCumulative = 0;
  for (const month of months) {
    currentCumulative += month.current;
    previousCumulative += month.previous;
    month.currentCumulative = currentCumulative;
    month.previousCumulative = previousCumulative;
  }

  const currentToDate = months[cutoff - 1].currentCumulative;
  const previousToDate = months[cutoff - 1].previousCumulative;
  const difference = currentToDate - previousToDate;
  return {
    year: currentYear,
    baseYear,
    throughMonth: cutoff,
    months,
    currentToDate,
    previousToDate,
    difference,
    rate: previousToDate === 0 ? null : (difference / previousToDate) * 100,
    maxMonthly: Math.max(0, ...months.flatMap((month) => [month.current, month.previous])),
    maxCumulative: Math.max(
      0,
      ...months.flatMap((month) => [month.currentCumulative, month.previousCumulative])
    ),
  };
}

// ---- 買った曜日と時間帯 ------------------------------------------------

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 曜日×時間帯の購入回数。BOOTHの画面には無い切り口で、
// 買い物が集中する時間が分かる。
//
// **金額ではなく注文の件数を数える。** 高額の1件で1マスが真っ赤になると、
// 「その時間によく買う」ようには読めない。
//
// 日付が読めない注文と時刻が無い注文は数えられないので、除外した件数を返して
// 画面で断る(0として置くと、日曜0時に大量購入したように見えてしまう)。
function buildWeekdayHourStats(results, fromKey, toKey) {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let counted = 0;
  let skipped = 0;
  let max = 0;

  for (const result of results) {
    const monthKey = monthKeyOf(result.date);
    if (fromKey && (!monthKey || monthKey < fromKey)) continue;
    if (toKey && (!monthKey || monthKey > toKey)) continue;

    const date = parseOrderDate(result.date);
    const weekday = orderWeekday(date);
    if (weekday === null || date.hour === null) {
      skipped += 1;
      continue;
    }
    cells[weekday][date.hour] += 1;
    counted += 1;
    max = Math.max(max, cells[weekday][date.hour]);
  }

  return { cells, counted, skipped, max };
}

// ---- ショップ(作者)ごとのまとめ ----------------------------------------

// ランキングの並べ替えの基準。金額と点数では1位が入れ替わるので、
// どちらで並べたのかを画面と共有文面の両方に出せるよう名前で持つ
const SHOP_SORTS = {
  // 同額(同点数)のときはもう一方を第2の基準にする。両方同じなら名前順で固定し、
  // 再描画のたびに順位が入れ替わらないようにする
  amount: (a, b) => b.total - a.total || b.count - a.count,
  count: (a, b) => b.count - a.count || b.total - a.total,
};
const DEFAULT_SHOP_SORT = "amount";

//
// **ここだけは注文単位のお支払金額を使えない。**お支払金額は注文に1つしかなく、
// 1つの注文が複数のショップにまたがるため、ショップへ割り振れない。
// そのため商品の合計(単価×数量+BOOST)で集計する。送料やクーポンは入らないので、
// ショップ別の合計をすべて足しても全体の合計額とは一致しない。
// 画面にその旨を出すこと。
//
// 表示名は変わりうるので、同じショップかどうかはURLで判断する。
function aggregateByShop(results, sortBy) {
  const shops = new Map();
  for (const result of results) {
    if (!Array.isArray(result.items)) continue;
    for (const item of result.items) {
      const key = item.shopUrl || item.shop;
      if (!shops.has(key)) {
        shops.set(key, {
          key,
          name: item.shop,
          url: item.shopUrl || "",
          count: 0,
          giftCount: 0,
          total: 0,
          gift: 0,
          // 金額を読めなかった商品。0として足すと少ない額を正しい合計に見せてしまう
          unknown: 0,
          orderIds: new Set(),
          // 買った商品の名前。同じ商品を複数の注文で買うと重複するので集合で持つ
          itemNames: new Set(),
        });
      }
      const row = shops.get(key);
      row.orderIds.add(result.id);
      if (item.name) row.itemNames.add(item.name);

      const quantity = itemQuantity(item);
      const count = typeof quantity === "number" ? quantity : 0;
      row.count += count;
      if (item.gift) row.giftCount += count;

      const amount = itemAmount(item);
      if (amount === null) {
        row.unknown++;
        continue;
      }
      row.total += amount;
      if (item.gift) row.gift += amount;
    }
  }
  const compare = SHOP_SORTS[sortBy] || SHOP_SORTS[DEFAULT_SHOP_SORT];
  return Array.from(shops.values())
    .map(({ orderIds, itemNames, ...row }) => ({
      ...row,
      orders: orderIds.size,
      // 並びが実行のたびに変わらないよう名前順で固定する
      items: Array.from(itemNames).sort((a, b) => a.localeCompare(b, "ja")),
    }))
    .sort((a, b) => compare(a, b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---- 年ごとの振り返り --------------------------------------------------

const YEAR_SUMMARY_TOP_SHOPS = 3;

// 注文のある年を新しい順に返す。まとめの年を選ぶプルダウンに使う
function orderYears(results) {
  const years = new Set();
  for (const result of results) {
    const date = parseOrderDate(result.date);
    if (date) years.add(date.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

// 「その年にはじめて出会った作者」を数えるには、その年より前に買っているかを
// 知る必要がある。年で絞った結果だけでは判定できないので、全期間を受け取る。
//
// 合計金額は他の画面と同じく注文単位のお支払金額から出す。作者数・点数・BOOSTは
// 商品明細からしか出せないため、ここでも「ショップ別の合計を足しても total には
// ならない」というランキングと同じずれが残る。画面に断りを出すこと。
function buildYearSummary(results, year) {
  const target = Number(year);
  const inYear = [];
  const before = [];
  for (const result of results) {
    const date = parseOrderDate(result.date);
    if (!date) continue;
    if (date.year === target) inYear.push(result);
    else if (date.year < target) before.push(result);
  }
  const valid = inYear.filter((result) => typeof result.amount === "number");
  // 金額が取れていても商品明細が無ければ、点数・作者数・ランキングは少なくなる。
  // 金額の未収集と混ぜると何が不完全なのか分からないため、別の件数で返す。
  const detailPendingCount = valid.filter((result) => !Array.isArray(result.items)).length;

  // その年より前に買ったことのある作者。未収集の注文は明細を持たないので
  // ここに現れず、「はじめて」を多めに数えてしまう。件数を返して画面で断る
  const knownShops = new Set();
  let beforePending = 0;
  for (const result of before) {
    if (!Array.isArray(result.items)) {
      beforePending++;
      continue;
    }
    for (const item of result.items) knownShops.add(item.shopUrl || item.shop);
  }

  const shops = new Set();
  const newShops = new Set();
  let itemCount = 0;
  let giftItemCount = 0;
  let boost = 0;
  let boostItemCount = 0;
  for (const result of valid) {
    if (!Array.isArray(result.items)) continue;
    for (const item of result.items) {
      const key = item.shopUrl || item.shop;
      shops.add(key);
      if (!knownShops.has(key)) newShops.add(key);

      const quantity = itemQuantity(item);
      const count = typeof quantity === "number" ? quantity : 0;
      itemCount += count;
      if (item.gift) giftItemCount += count;
      // BOOSTは今のところ画面にも共有文面にも出していない(使う人が少なく、
      // 「支援した作者」と語がぶつかるため一旦外した)。集計だけは残してある。
      // 0円のBOOSTは「応援した」と数えない。金額の行は常に出るため
      if (typeof item.boost === "number" && item.boost > 0) {
        boost += item.boost;
        boostItemCount += 1;
      }
    }
  }

  const months = new Map();
  for (const result of valid) {
    const key = monthKeyOf(result.date);
    if (!key) continue;
    months.set(key, (months.get(key) || 0) + result.amount);
  }
  let busiestMonth = null;
  for (const [key, total] of months) {
    // 同額なら先に出てきた月を残し、並びで結果が変わらないようにする
    if (!busiestMonth || total > busiestMonth.total) busiestMonth = { key, total };
  }

  return {
    year: target,
    total: valid.reduce((sum, result) => sum + result.amount, 0),
    gift: valid.reduce((sum, result) => sum + giftAmount(result), 0),
    orderCount: valid.length,
    // 金額を収集できていない注文。まとめは「その年の全部」を名乗るので必ず出す
    pendingCount: inYear.length - valid.length,
    detailPendingCount,
    itemCount,
    giftItemCount,
    boost,
    boostItemCount,
    shopCount: shops.size,
    newShopCount: newShops.size,
    beforePending,
    busiestMonth,
    topShops: aggregateByShop(valid).slice(0, YEAR_SUMMARY_TOP_SHOPS),
  };
}

async function readStored(key, fallback) {
  const stored = await ext.storage.local.get([key]);
  return stored[key] === undefined ? fallback : stored[key];
}

async function writeStored(key, value) {
  await ext.storage.local.set({ [key]: value });
}

function loadCache() {
  return readStored(CACHE_KEY, {});
}

function loadIndex() {
  return readStored(INDEX_KEY, null);
}

function removeStored(key) {
  return ext.storage.local.remove(key);
}

function saveIndex(index) {
  return writeStored(INDEX_KEY, index);
}

function saveCache(cache) {
  return writeStored(CACHE_KEY, cache);
}

function loadSummary() {
  return readStored(SUMMARY_KEY, null);
}

function saveSummary(summary) {
  return writeStored(SUMMARY_KEY, summary);
}

// 集計ページのタブが不意に閉じられたりクラッシュしたりすると、終了時の
// clearRunState() が間に合わず進捗が残る。残ったままだとポップアップが
// 永久に「実行中」を出し続けるため、しばらく更新のない進捗は動いていないとみなす。
// 進捗は取得1件ごとに書き直されるので、1件の取得にかかる時間より十分長くとる
const RUN_STATE_STALE_MS = 30_000;

async function loadRunState() {
  const runState = await readStored(RUN_STATE_KEY, null);
  if (!runState) return null;
  // 時刻を持たないのは、この仕組みより前のバージョンが残した進捗。
  // 動いていない可能性が高いので同じく無視する
  if (typeof runState.updatedAt !== "number") return null;
  return Date.now() - runState.updatedAt > RUN_STATE_STALE_MS ? null : runState;
}

function saveRunState(state) {
  return writeStored(RUN_STATE_KEY, { ...state, updatedAt: Date.now() });
}

function clearRunState() {
  return ext.storage.local.remove(RUN_STATE_KEY);
}

// 集計ページを開く。既に開いているタブがあればそれをフォーカスする
// (tabs.query での検索は "tabs" 権限が必要になるため、タブIDを保存して使い回す)
async function openDashboard() {
  const url = ext.runtime.getURL("dashboard.html");
  const tabId = await readStored(DASHBOARD_TAB_KEY, null);
  if (tabId != null) {
    try {
      const tab = await ext.tabs.get(tabId);
      await ext.tabs.update(tab.id, { active: true });
      if (tab.windowId != null && ext.windows) {
        await ext.windows.update(tab.windowId, { focused: true });
      }
      return tab.id;
    } catch (e) {
      // 既に閉じられている場合は新規に開く
    }
  }
  const created = await ext.tabs.create({ url });
  await writeStored(DASHBOARD_TAB_KEY, created.id);
  return created.id;
}
