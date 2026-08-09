"use strict";

// Chromiumを主対象にしつつ、Firefoxの一時読み込みでも使えるAPI名へ寄せる簡易ラッパー
const ext = typeof browser !== "undefined" ? browser : chrome;

// { [orderId]: { amount, gift, status, date, items: [{ shop, shopUrl, name, price, boost, gift }] } }
const CACHE_KEY = "boothOrderCache";
const INDEX_KEY = "boothOrderIndex"; // { updatedAt, orders: [{ id, status, date }] }
const SUMMARY_KEY = "boothSummary"; // 最後に完了した集計の要約(ポップアップ表示用)
const RUN_STATE_KEY = "boothRunState"; // 実行中の進捗(ポップアップから覗くため)
const RUN_LOCK_KEY = "boothRunLock"; // 複数タブから同時に収集しないための期限付きロック
const DASHBOARD_TAB_KEY = "boothDashboardTab"; // 集計ページのタブID
const THEME_KEY = "boothTheme"; // 配色テーマの選択("light" | "dark" | "system")
// D14 沼レポートの手動割り当て { [商品キー]: "アバターkey" | "__multi__" }
const AVATAR_ASSIGN_KEY = "boothAvatarAssign";

// 注文詳細ページ。取得(dashboard.js)と内訳のリンク(dashboard-view.js)の両方で使うので
// 共通側に置く
const ORDER_DETAIL_URL = "https://accounts.booth.pm/orders/";

// 注文番号はBOOTHのHTML由来の文字列なので、URLへ挿す前に数字だけであることを確かめる。
// 通らないものはリンクにせず、文字のまま出す(勝手に別のURLを組み立てない)
const ORDER_ID_PATTERN = /^\d+$/;

function orderDetailUrl(id) {
  return ORDER_ID_PATTERN.test(String(id)) ? `${ORDER_DETAIL_URL}${id}` : null;
}

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

// ---- D12 集計対象の絞り込み(すべて / 自分用 / ギフト) --------------------
//
// 注文単位の「お支払金額」は自分用とギフトへ分けられない(送料やクーポンが
// 注文に1つしか無く、どちらへ割り振るかを決められない)。そのため絞り込み中の
// 金額だけは商品の内訳(単価×数量+BOOST)から出す。**残った差額は消さずに
// 画面へ出す**(黙って落とすと、少ない額を正しい合計に見せることになる)。

const GIFT_FILTERS = ["all", "self", "gift"];
const GIFT_FILTER_LABELS = { all: "すべて", self: "自分用", gift: "ギフト" };
// 共有文面・共有カードに出す見出し。部分集計を全体の数字に見せないための印
const GIFT_FILTER_SHARE_LABELS = { self: "🙋自分用だけ", gift: "🎁贈ったギフトだけ" };
// D16 絞り込み中のCSVにだけ足す列名(「すべて」のCSVは公開契約なので変えない)
const GIFT_FILTER_CSV_COLUMN = "集計対象";

function normalizeGiftFilter(value) {
  return GIFT_FILTERS.includes(value) ? value : "all";
}

// 絞り込んだ一覧と、対象別に分けられなかった金額を返す。
// - 該当する商品が1つも無い注文は対象から外す(0円の注文として件数を膨らませない)
// - 商品明細を持たない注文は分けようがないので、金額を不明(未収集)に落とす。
//   除外はしない。除外すると未収集の断り書きから消えてしまう
function filterResultsByGift(results, filter) {
  const mode = normalizeGiftFilter(filter);
  if (mode === "all") return { rows: results, gap: 0, gapUnknown: 0 };
  const want = mode === "gift";
  const rows = [];
  let gap = 0;
  let gapUnknown = 0;
  for (const result of results) {
    if (!Array.isArray(result.items)) {
      rows.push({ ...result, amount: undefined, gift: undefined, shipping: undefined });
      gapUnknown++;
      continue;
    }
    const items = result.items.filter((item) => Boolean(item.gift) === want);
    if (items.length === 0) continue;
    const whole = sumItemAmounts(result.items);
    if (typeof result.amount === "number" && whole !== null) {
      gap += result.amount - whole;
    } else {
      // 差額を出せない注文。0として足すと「差は無い」と言い切ることになる
      gapUnknown++;
    }
    const amount = sumItemAmounts(items);
    rows.push({
      ...result,
      items,
      amount: amount === null ? null : amount,
      gift: want ? amount : 0,
      // 送料は注文に1つしか無く、対象別に割り振れない。差額の側で数える
      shipping: undefined,
    });
  }
  return { rows, gap, gapUnknown };
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

// ---- D15 収集健全性の警報 ----------------------------------------------
//
// BOOTH側がHTMLを変えると、注文ごとの「取得失敗」は出るものの、全体として
// 「セレクタが漂流した」とは気付けない。1回の収集でまとまった件数が読めなかった
// ときだけ、構造変更の可能性を名指しで知らせる。
// 1〜2件は個別の事情(削除済み・一時的な不調)なので個別表示に任せる。
const COLLECT_HEALTH_MIN_UNREADABLE = 3;
const COLLECT_HEALTH_MIN_RATIO = 0.3;

// 出す文面。閾値に届かなければ空文字を返す(呼び出し側は空なら出さない)
function collectHealthAlert(health) {
  if (!health) return "";
  const attempted = health.attempted;
  const unreadable = health.unreadable;
  if (!(attempted > 0) || unreadable < COLLECT_HEALTH_MIN_UNREADABLE) return "";
  if (unreadable / attempted < COLLECT_HEALTH_MIN_RATIO) return "";
  return (
    `今回の収集では${attempted}件中${unreadable}件で金額や明細を読み取れませんでした。` +
    "BOOTH側のページ構造が変わった可能性があります。拡張機能の更新情報を確認してください。"
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

// ポップアップに出す「今年の合計」。この項目より前に保存された boothSummary には
// 年の情報が無い。無いものを0円と書くと買っていないように見えるので、
// その場合は null を返して行ごと出さない(次の集計で保存されれば出る)
function summaryYearLine(summary) {
  if (!summary || typeof summary.yearTotal !== "number" || typeof summary.year !== "number") {
    return null;
  }
  return {
    label: `${summary.year}年の合計`,
    value: formatYen(summary.yearTotal),
    count: `収集済み ${summary.yearCount || 0}件`,
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

// ---- D14 沼レポート(アバター別支出内訳) --------------------------------
//
// **商品ページへは一切アクセスしない。**手元のキャッシュにある items[].name だけで判断する。
// BOOTHの購入履歴では、バリエーションのある商品の名前が「商品名 (バリエーション名)」の
// 形で保存されている(2026-08-08にユーザーの実環境で実測)。この末尾の括弧を剥がし、
// 中身をトークンへ分解して、同じトークンを持つ商品どうしをアバターとしてまとめる
// (D17-a。名簿 avatar-master.js は表記ゆれの統合と表示名のヒントであって辞書ではない)。
//
// **読み取れなかったものを推測で埋めない。**素体名を1つに絞れなければ「複数対応」、
// 1つも見つからなければ「未分類」として、そのまま画面に出す。直したいときは
// 商品単位の手動割り当てで上書きしてもらう。

// 「複数対応」を表す予約キー。辞書の key とぶつからないよう記号で囲む
const AVATAR_MULTI_KEY = "__multi__";

// 対応する括弧の組。BOOTHの商品名には半角と全角のどちらも現れる
const VARIATION_BRACKETS = { ")": "(", "）": "（" };

// 商品名を「本体」と「末尾のバリエーション名」へ分ける。
//
// 採用するのは**最後の対応括弧グループ**。入れ子(「商品名 (エク(ミルフィ))」)では
// 外側のグループを採るので、バリエーション名は「エク(ミルフィ)」になる。
// 括弧が無いもの、閉じ括弧に対応する開き括弧が無いもの、括弧の中身が本体と同文のもの
// (単一バリエーション商品はこの形になる)は「バリエーションなし」= null とする。
function parseItemName(name) {
  const text = String(name === undefined || name === null ? "" : name).trim();
  const close = text[text.length - 1];
  const open = VARIATION_BRACKETS[close];
  if (!open) return { base: text, variation: null };

  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open && --depth === 0) {
      const inner = text.slice(i + 1, text.length - 1).trim();
      const base = text.slice(0, i).trim();
      // 本体が空(名前まるごとが括弧)なら、剥がすと何も残らないので剥がさない
      if (!base || !inner || inner === base) return { base: base || text, variation: null };
      return { base, variation: inner };
    }
  }
  // 閉じ括弧だけがある壊れた名前。バリエーションとして扱わない
  return { base: text, variation: null };
}

// ---- D17-a 辞書レスのトークン照合 --------------------------------------
//
// D14 は固定辞書へ当てにいく方式だったが、アバターは数万体あり毎日増えるので原理的に
// 網羅できない(実測: 辞書33体で金額の15.5%しか特定できず、辞書に無い「凪」は全滅)。
// D17 では**買った商品どうしを突き合わせて**アバターのまとまりを見つける。
// 名簿(avatar-master.js)は表記ゆれの統合と表示名のためのヒントに降格した。

// カタカナはひらがなへ寄せる。「シナノ」と「しなの」を別のアバターにしないため
function kanaToHira(text) {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// トークンの切れ目。英数字列・かな列・漢字列をそれぞれ1語として取り出す。
// 記号・絵文字・空白はどの区間にも入らないので、ここで自然に落ちる
// (末尾の「-」「'」を剥がす処理が要らないのはこのため)
const AVATAR_TOKEN_RUN = /[a-z0-9]+|[ぁ-ゖゝゞー]+|[一-鿿々]+/g;
const AVATAR_TOKEN_KANJI = /[一-鿿々]/;
const AVATAR_TOKEN_LATIN = /^[a-z0-9]+$/;
// 素体名の飾り。「森羅用」「マヌカ対応」「しおちゃん」を素の名前と同じトークンにする。
// 「向け」の「け」はかななので漢字の区間には入らない。ここで見るのは「向」まで
const AVATAR_TOKEN_SUFFIX = /(対応|用|向|ちゃん|さん|くん)$/;

// アバター名の手掛かりにならない語。実データ637明細でバケツ化してしまったノイズを
// 元に並べてある(2026-08-09の検品で131個の名簿外バケツを実測)。
// 書くときは見たままの表記でよい。NFKC・小文字化・カタカナ→ひらがなの正規化は
// AVATAR_STOP_SET を組むときに通すので、トークン側と必ず同じ形になる
const AVATAR_STOP_WORDS = Object.freeze([
  "ver", "version", "full", "pack", "fullpack", "set", "fullset", "size", "type",
  "color", "colour", "custom", "default", "basic", "normal", "simple", "original",
  "avatar", "avatars", "vrc", "vrchat", "vrm", "vr", "unity", "quest", "pc", "dl", "data",
  "texture", "psd", "fbx", "unitypackage", "edition", "all", "and", "for", "with", "the",
  "hair", "bob", "twin", "long", "short", "ribbon", "doll", "pose", "vol", "makeup",
  "eyewear", "horn", "halo", "wing", "wings", "milk", "hug", "bloom", "light", "dark",
  "angel", "devil", "god", "spring", "summer", "autumn", "winter", "series", "model",
  "tool", "tools", "system", "font", "shader", "particle", "prefab", "gimmick",
  "donation", "support", "free", "update", "extension", "world", "nail", "coffee", "dlc",
  "red", "blue", "green", "black", "white", "pink", "yellow", "purple", "brown",
  "gray", "grey", "navy", "beige", "ivory", "gold", "silver", "orange",
  "セット", "セットアップ", "サイズ", "カラー", "バージョン", "テクスチャ", "アバター",
  "フルセット", "フルパック", "パック", "タイプ", "モデル", "ヘアモデル", "オリジナル",
  "ギミック", "ワールド", "ワールドギミック", "アバターギミック", "ツール", "タブレット",
  // 「ラビ」はここに入れない。実在アバター「ラビ先輩」の名前で、落とすと名前が壊れる
  "シリーズ", "コーデ", "ネイルチップ", "ヘイロー", "メガネ", "タトゥー",
  "フォント", "シェーダー", "パーティクル", "アニメーション", "コーヒーをおごる",
  "カンタン", "オマケ", "ノミ", "ホワイト", "ブラック", "レッド", "ブルー", "グリーン",
  "ピンク", "イエロー", "パープル", "グレー", "ベージュ", "ゴールド", "シルバー", "オレンジ",
  "版", "通常版", "無料版", "支援版", "電子版", "本体", "特典", "差分", "単品", "衣装",
  "素体", "汎用", "対応", "用", "向", "設定済", "自動", "想定", "購入", "販売", "支援",
  "合計", "中身", "更新", "拡張", "魔法", "天使", "心音", "以上", "数字", "内容",
  // 「同じです」は「同」(名簿に無い漢字1文字)が落ちて「じです」だけ残る。断片ごと止める
  "じです",
  "赤", "青", "白", "黒", "桃", "紫", "緑", "黄", "色", "他", "等",
]);

const AVATAR_STOP_SET = new Set(
  AVATAR_STOP_WORDS.map((word) => kanaToHira(String(word).normalize("NFKC").toLowerCase()))
);

// 名簿を「トークン → 保存キー」へ展開したもの。popup.html は avatar-master.js を読まないので、
// 読み込み時ではなく最初に使うときに組む
let avatarAliasCache = null;
function avatarAliasMap() {
  if (avatarAliasCache) return avatarAliasCache;
  avatarAliasCache = new Map();
  for (const avatar of AVATAR_MASTER) {
    for (const label of [avatar.jp, avatar.en, ...(avatar.alt || [])]) {
      for (const token of avatarRawTokens(label)) avatarAliasCache.set(token, avatar.en);
    }
  }
  return avatarAliasCache;
}

// 保存キー → 表示名。名簿 → 素体商品の題名から拾った名前(index) → キーそのもの、の順。
// どこにも無ければキーをそのまま出す。勝手に別のアバターへ寄せない
let avatarNameCache = null;
function avatarDisplayName(key, index = null) {
  if (!avatarNameCache) {
    avatarNameCache = new Map();
    for (const avatar of AVATAR_MASTER) {
      avatarNameCache.set(avatar.en, avatar.jp);
      for (const alt of avatar.alt || []) {
        if (!avatarNameCache.has(alt)) avatarNameCache.set(alt, avatar.jp);
      }
    }
  }
  return avatarNameCache.get(key) || (index && index.names.get(key)) || key;
}

// アバター名になりえない形のトークン。語そのものを並べるストップ語と違い、
// 「形」で落とすので実データに出てくる無数の版数・数量表記を1行で片付けられる
function isAvatarNoiseToken(token) {
  if (AVATAR_TOKEN_KANJI.test(token)) return false;
  // 数量・年・版数(「21」「2025」「v1」「ver2」)
  if (/^\d+$/.test(token) || /^ver?\d+$/.test(token)) return true;
  // 英字2文字以下は略号("ma" "3d" "vr")。名簿の最短は "zev" "eku" の3文字
  if (AVATAR_TOKEN_LATIN.test(token)) return token.length < 3;
  // かなは「しお」「まよ」「えく」があるので2文字まで許す
  return token.length < 2;
}

// ストップ語を落とす前のトークン。名簿の展開に使う
function avatarRawTokens(text) {
  if (!text) return [];
  const normalized = kanaToHira(String(text).normalize("NFKC").toLowerCase());
  const out = [];
  for (const run of normalized.match(AVATAR_TOKEN_RUN) || []) {
    let token = run;
    for (;;) {
      const next = token.replace(AVATAR_TOKEN_SUFFIX, "");
      // 剥がすと何も残らないなら剥がさない(「用」だけの語はストップ語で落ちる)
      if (!next || next === token) break;
      token = next;
    }
    if (isAvatarNoiseToken(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

// 照合に使うトークン。名簿に載っている語はストップ語・漢字1文字の判定より優先する
// (「ライム」「プラム」「ミント」は色名でもあり実在アバターでもあり、
//  「凪」「萌」「獏」は漢字1文字の実在アバター)
function avatarTokens(text) {
  const alias = avatarAliasMap();
  return avatarRawTokens(text).filter((token) => {
    if (alias.has(token)) return true;
    if (AVATAR_STOP_SET.has(token)) return false;
    // 名簿に無い漢字1文字は、実データでは「点」「付」「全」「服」「輪」のような
    // 助数詞・一般語ばかりだった(2026-08-09の検品で実測)。名簿に無い1文字の
    // アバターは拾えなくなるが、手動割り当てで直せるほうを取る
    return !(token.length === 1 && AVATAR_TOKEN_KANJI.test(token));
  });
}

function isAvatarLatinToken(token) {
  return AVATAR_TOKEN_LATIN.test(token);
}

// トークンがどのバケツに属するか。名簿にあれば名簿のキー、無ければ
// 「2商品以上に現れた」として採用されたトークン自身。どちらでもなければ空文字。
//
// **部分一致(includes)は使わない。**実測で「凪」が実在アバター「凪夜(Nagiya Ruri)」の
// バリエーション名へ構造的に誤ヒットした(名簿74体中この1組)。トークン完全一致なら
// 「凪」と「凪夜」は別トークンなので、この衝突は起きない
function avatarBucketKey(token, index) {
  if (!index) return avatarAliasMap().get(token) || "";
  return (
    avatarAliasMap().get(token) ||
    index.aliases.get(token) ||
    (index.buckets.has(token) ? token : "")
  );
}

// 素体商品(アバターそのもの)の名乗り。実データの表記より
// (「オリジナル3Dモデル「しなの」」「【オリジナル3Dモデル】狛乃-Komano-」
//  「慧 -Kei- オリジナル3Dモデル」「胴長パグ #パグ3D」)
const AVATAR_SOLO_MARKER =
  /オリジナル[3３][DdＤｄ]モデル|オリジナル[3３][DdＤｄ]アバター|[3３][DdＤｄ]キャラクターモデル|アバター素体|#\S{1,15}[3３][DdＤｄ]\b/g;

// ハッシュタグは名前の一部ではない。「#パグ3D」「#arupaka_VRC」のような検索用の札で、
// 残しておくと名前として拾ってしまう
const AVATAR_HASHTAG = /#\S+/g;

// 素体商品の題名から名乗りとハッシュタグを取り除いた残り。素体商品でなければ null
function avatarSoloResidue(name) {
  const { base } = parseItemName(name);
  const stripped = base.replace(AVATAR_SOLO_MARKER, " ");
  if (stripped === base) return null;
  return stripped.replace(AVATAR_HASHTAG, " ");
}

// 素体商品の題名から、名乗っている名前のトークンを取り出す。素体商品でなければ空。
//
// 素体商品は1商品しか買わない(同じ素体を2回買わない)ので、2商品の昇格則には
// 永久に届かない。あからさまにアバターなのに未分類へ沈むので、この名乗りがある商品だけは
// 1商品でもバケツにする。
// 題名は自分の名前を名乗る場所なので、ふつうなら捨てる漢字1文字(「慧」)もここでは残す
function avatarSoloTokens(name) {
  const residue = avatarSoloResidue(name);
  if (residue === null) return [];
  const alias = avatarAliasMap();
  return avatarRawTokens(residue).filter((token) => alias.has(token) || !AVATAR_STOP_SET.has(token));
}

// 素体商品の題名から飾りを落とした名前そのもの。素体商品でなければ空。
// 「ラビ先輩」のように語へ割ると壊れる名前を、割らずに1つのバケツ名として使う
const AVATAR_SOLO_DECORATION = /[【】「」『』（）()［］\[\]〈〉《》〔〕｛｝{}\-–—_|/\\・,、。!！?？"'”’’]+/g;

function avatarSoloName(name) {
  const residue = avatarSoloResidue(name);
  if (residue === null) return "";
  return residue
    .normalize("NFKC")
    .replace(AVATAR_SOLO_DECORATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 文字列から見つかったバケツのキー(重複なし、現れた順)
function avatarKeysIn(text, index) {
  const keys = [];
  for (const token of avatarTokens(text)) {
    const key = avatarBucketKey(token, index);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

// 買ったものぜんぶを見て、アバターのバケツを決める。
//
// 採用の規則は2つだけ。
//   (a) 名簿に載っているトークン …… 1商品しか無くても採用する
//   (b) 2つ以上の別商品(ショップ+品名本体で判定)の**バリエーション名**に現れたトークン
// (b) に2商品の縛りを付けているのは、1商品にしか出ない語(色名・サイズ・造語)を
// バケツにすると順位表がノイズで埋まるため。同じアバター向けの商品を2つ以上買っていれば
// 沼なので、この規則で取りこぼす沼は無い。
//
// (b) の採掘元を**バリエーション名だけ**に絞っているのは実測による。品名本体まで
// 採掘すると、実データ637明細で名簿外のバケツが131個できて大半が一般語だった
// (hair・bob・pose・ribbon・devil など、そのほとんどが品名本体由来)。
// バリエーション名は素体名の置き場所なので、ここだけを見ればノイズ源を断てる。
// 品名本体は、既に決まったバケツ(名簿+昇格済み)の照合には引き続き使う
// (「森羅用テクスチャ」のように、アバター名が品名にしか出ない商品の補完)。
//
// あわせて「日本語表記とローマ字表記の併記」(業界標準の書き方)を共起として数える。
// 2商品以上で併記されていれば同じアバターの別表記である可能性が高いが、
// 「Milfy, Eku」のような**別アバターの併記**と機械的に区別できないので自動では統合せず、
// 手動割り当てUIへ候補として出すだけにする
function buildAvatarIndex(results) {
  const tokenProducts = new Map();
  const pairProducts = new Map();
  const buckets = new Set();
  const aliases = new Map();
  const names = new Map();
  const add = (map, key, productKey) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(productKey);
  };

  for (const result of results || []) {
    if (!Array.isArray(result.items)) continue;
    for (const item of result.items) {
      // 素体商品は1商品でも昇格させる。バリエーションの有無に関係なく見る
      const solo = avatarSoloTokens(item && item.name);
      if (solo.length === 1) buckets.add(solo[0]);
      else if (solo.length >= 2) {
        const latin = solo.filter(isAvatarLatinToken);
        const japanese = solo.filter((token) => !isAvatarLatinToken(token));
        // 素体商品の題名で「日本語名 ローマ字名」が並ぶのは同じアバターの併記。
        // ここは複数アバターを列挙する場所ではないので、共起候補にせず統合してよい
        if (latin.length === 1 && japanese.length === 1) {
          const key = avatarAliasMap().get(japanese[0]) || avatarAliasMap().get(latin[0]) || latin[0];
          aliases.set(japanese[0], key);
          aliases.set(latin[0], key);
          if (!names.has(key)) names.set(key, japanese[0]);
        } else if (latin.length === 0) {
          // 「ラビ先輩」「幽狐族のお姉様」のように日本語だけで何語かに割れる名前。
          // 語ごとに分けると「先輩」だけが残って名前が壊れるので、飾りを落とした
          // 題名まるごとを1つのバケツにする。
          // ponytail: 見つける手掛かりは先頭の語だけに絞っている(「ラビ」で
          // 「ラビポニー」も寄る)。「先輩」のような後ろの語まで手掛かりにすると、
          // 無関係な商品まで引き込む。取りこぼしは手動割り当てで直せる
          const full = avatarSoloName(item && item.name);
          if (full) aliases.set(japanese[0], full);
        }
        // 英字を含んだまま3語以上に割れるものは決めない(従来どおり)
      }

      const { variation } = parseItemName(item && item.name);
      if (!variation) continue;
      const tokens = avatarTokens(variation);
      if (tokens.length === 0) continue;
      const productKey = itemProductKey(item);
      for (const token of tokens) add(tokenProducts, token, productKey);
      // 併記とみなすのは「和文1語＋英字1語」だけ。3語以上並ぶものは
      // 複数アバター対応の列挙でありうるので、共起として数えない
      const latin = tokens.filter(isAvatarLatinToken);
      const japanese = tokens.filter((token) => !isAvatarLatinToken(token));
      if (latin.length === 1 && japanese.length === 1) {
        add(pairProducts, `${japanese[0]}\u0000${latin[0]}`, productKey);
      }
    }
  }

  const alias = avatarAliasMap();
  for (const [token, products] of tokenProducts) {
    if (!alias.has(token) && products.size >= 2) buckets.add(token);
  }

  const index = { buckets, aliases, names };
  const merges = [];
  for (const [pair, products] of pairProducts) {
    if (products.size < 2) continue;
    const [japanese, latin] = pair.split("\u0000");
    const left = avatarBucketKey(japanese, index);
    const right = avatarBucketKey(latin, index);
    // どちらもバケツでない組は割り当て先が無いので出さない。
    // 既に同じバケツ(名簿で統合済み)の組も、直すところが無いので出さない
    if (!left && !right) continue;
    if (left && right && left === right) continue;
    merges.push({ japanese, latin, key: left || right, count: products.size });
  }
  merges.sort((a, b) => b.count - a.count || (a.japanese < b.japanese ? -1 : 1));
  index.merges = merges;
  return index;
}

// Full Pack のように「複数素体ぶん」を名乗る表記があるか
// 「25アバター対応」「95アバター対応」「22 Avatars」のように、対応する体数を名乗る表記。
// 体数を書ける形は幅があるので、語を並べるのではなく形で見る
const AVATAR_MULTI_COUNT = /\d+\s*(?:\+?\s*α)?\s*[体人]?\s*(?:の)?\s*(?:アバター|avatars?)/i;

function hasAvatarMultiMarker(text) {
  if (!text) return false;
  // 全角数字・全角英字でも同じように読めるようそろえてから見る
  const lower = String(text).normalize("NFKC").toLowerCase();
  if (AVATAR_MULTI_COUNT.test(lower)) return true;
  return AVATAR_MULTI_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

// ショップと商品名のあいだに挟む区切り。**保存キーの一部なので後から変えない**
// (変えると保存済みの割り当てが別の商品を指すことになる)。
// 商品名にもURLにも現れない制御文字を使い、区切りの取り違えを起こさない
const PRODUCT_KEY_SEPARATOR = " / ";

// 手動割り当ての保存キー。同じ商品の別バリエーションを1つの商品として扱いたいので、
// バリエーションを剥がした本体名とショップで決める。表示名は変わりうるが、
// ここは保存済みデータ同士の突き合わせにしか使わないので取り違えは起きない
function itemProductKey(item) {
  const { base } = parseItemName(item && item.name);
  const shop = (item && (item.shopUrl || item.shop)) || "";
  return `${shop}${PRODUCT_KEY_SEPARATOR}${base}`;
}

// 商品1件がどのアバター向けかを決める。優先順位は次のとおり。
//  1. 手動割り当て(本人が決めたものを推測で覆さない)
//  2. バリエーション名(「商品名 (エク)」の括弧の中。最も確度が高い)
//  3. 商品名の本体(テクスチャ系など、素体名が品名側にしか出ない商品の補完)
// 2 と 3 のどちらでも、素体名が2つ以上見つかれば「複数対応」にする。
// 1つも見つからなければ「未分類」。ここで当てずっぽうに1つ選ばない
// index は buildAvatarIndex の結果。省略すると名簿に載っているアバターだけを見る
// (単票の判定や、集計を通さない呼び出し用)
function classifyItemAvatar(item, assignments, index = null) {
  const manual = assignments ? assignments[itemProductKey(item)] : undefined;
  if (typeof manual === "string" && manual) {
    if (manual === AVATAR_MULTI_KEY) return { kind: "multi", key: AVATAR_MULTI_KEY, manual: true };
    // 名簿に無いキー(未知トークンのバケツ、旧版で保存された割り当て)もそのまま通す。
    // 本人が指定したものを、こちらの都合で未分類へ落とさない。表示名は
    // avatarDisplayName がキーのまま出す
    return { kind: "avatar", key: manual, manual: true };
  }
  const { base, variation } = parseItemName(item && item.name);
  for (const text of [variation, base]) {
    if (!text) continue;
    if (hasAvatarMultiMarker(text)) return { kind: "multi", key: AVATAR_MULTI_KEY, manual: false };
    const keys = avatarKeysIn(text, index);
    if (keys.length === 1) return { kind: "avatar", key: keys[0], manual: false };
    if (keys.length > 1) return { kind: "multi", key: AVATAR_MULTI_KEY, manual: false };
  }
  return { kind: "none", key: "", manual: false };
}

function emptyAvatarRow(key, name) {
  return { key, name, count: 0, total: 0, unknown: 0, items: new Set() };
}

function finishAvatarRow(row) {
  const { items, ...rest } = row;
  return { ...rest, items: Array.from(items).sort((a, b) => a.localeCompare(b, "ja")) };
}

// アバター別の合計・点数。
//
// **ショップ別ランキングと同じく、注文単位のお支払金額は使えない。**1つの注文が
// 複数のアバター向け商品にまたがるため、商品の合計(単価×数量+BOOST)で集計する。
// 送料やクーポンは入らないので、全部足しても全体の合計額とは一致しない。画面で断ること。
//
// 返り値の products は手動割り当てUIの受け皿。未分類のものと、手動で割り当て済みの
// ものだけを載せる(割り当て済みを外すと、間違えたときに戻せなくなる)
function aggregateByAvatar(results, assignments = {}, sortBy = DEFAULT_SHOP_SORT) {
  const rows = new Map();
  const multi = emptyAvatarRow(AVATAR_MULTI_KEY, "複数対応");
  const none = emptyAvatarRow("", "未分類");
  const products = new Map();
  // バケツは買ったものぜんぶを見ないと決まらないので、1件ずつの判定より先に組む
  const index = buildAvatarIndex(results);

  for (const result of results) {
    if (!Array.isArray(result.items)) continue;
    for (const item of result.items) {
      const verdict = classifyItemAvatar(item, assignments, index);
      let row = null;
      if (verdict.kind === "multi") row = multi;
      else if (verdict.kind === "none") {
        // D17-b 種別枠(ワールド・ツール等)が受け持つ商品は「未分類」に数えない。
        // 二重に数えると未分類が膨らみ、アバター名を読み取れなかった買いものの量が
        // 読めなくなる。手動割り当ての一覧には残すので、特定のアバターへ寄せたい人は
        // そちらで上書きできる(手動割り当ては種別より優先)
        if (!classifyItemKind(item && item.name)) row = none;
      } else {
        if (!rows.has(verdict.key)) {
          rows.set(verdict.key, emptyAvatarRow(verdict.key, avatarDisplayName(verdict.key, index)));
        }
        row = rows.get(verdict.key);
      }

      const quantity = itemQuantity(item);
      const count = typeof quantity === "number" ? quantity : 0;
      const amount = itemAmount(item);
      if (row) {
        row.count += count;
        if (item.name) row.items.add(item.name);
        if (amount === null) row.unknown++;
        else row.total += amount;
      }

      // 手動で直せる対象。自動で当たったものまで並べると一覧が長くなりすぎる
      if (verdict.kind !== "none" && !verdict.manual) continue;
      const productKey = itemProductKey(item);
      if (!products.has(productKey)) {
        products.set(productKey, {
          key: productKey,
          name: parseItemName(item.name).base,
          shop: item.shop || "",
          count: 0,
          total: 0,
          // 今この商品に入っている割り当て(未割り当てなら空文字)
          assigned: verdict.manual ? verdict.key : "",
        });
      }
      const product = products.get(productKey);
      product.count += count;
      if (amount !== null) product.total += amount;
    }
  }

  const compare = SHOP_SORTS[sortBy] || SHOP_SORTS[DEFAULT_SHOP_SORT];
  return {
    rows: Array.from(rows.values())
      .map(finishAvatarRow)
      .sort((a, b) => compare(a, b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    multi: finishAvatarRow(multi),
    none: finishAvatarRow(none),
    products: Array.from(products.values()).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, "ja")
    ),
    // 「日本語表記とローマ字表記が同じアバターかもしれない」組。自動では統合しない
    merges: index.merges,
  };
}

// ---- D17-b 種別枠(ワールド・ワールド用アイテム・ギミック/ツール) ---------
//
// アバターの順位表とは別枠。判定に使うのは**品名の本体だけ**で、バリエーション名は見ない
// (バリエーション名は素体名の置き場所であって、商品の種類を書く場所ではない)。
// どれにも当たらなければ種別なしにする。無理に3つのどれかへ押し込まない。

// 「ギミック付き」「ギミック搭載」は衣装のおまけの説明。種別の手掛かりにしない
const ITEM_KIND_IGNORE = /ギミック(付き?|つき|搭載|入り)/g;

// MA(Modular Avatar)はアバターへギミックを入れる仕組み。ワールド用と区別が付くので、
// 「ギミック」と同じ品名に並んでいればアバター用のギミックとみなす。
// 「ギミック付き」は先に ITEM_KIND_IGNORE で消えるため、MA対応の衣装はここに来ない
const ITEM_KIND_MA_GIMMICK =
  /(?=[\s\S]*(?:\bma式|\bma対応|【ma[^】]*】|modular\s*avatar|モジュラーアバター))(?=[\s\S]*ギミック)/i;

const ITEM_KIND_RULES = Object.freeze([
  { key: "world", name: "ワールド", pattern: /向けワールド|【[^】]{0,8}ワールド】|ワールドアセット/ },
  {
    key: "world-item",
    name: "ワールド用アイテム",
    // Udon(UdonSharp・U#)はVRChatのワールド用スクリプト環境。
    // これを名乗るギミックはアバター用ではなくワールド用
    pattern: /ワールドギミック|ワールド用|ワールド想定|\budon|\bu#/i,
  },
  {
    key: "hair",
    name: "髪型",
    // ヘアピン・ヘアクリップ・ヘアアクセ・ヘアゴムは髪型ではなく小物なので外す。
    // 「ショートパンツ」「ロングコート」「ロングスカート」も衣装であって髪型ではない
    pattern:
      /hair\b|ヘア(?!ピン|クリップ|アクセ|ゴム)|髪型|髪|ボブ|\bbob\b|ツインテ|ポニーテール|ポニテ|ハイポニー|ウルフ|三つ編み|\bbraid|twin\s*tail|twintail|ponytail|お団子|おだんご|ショート(?!パンツ)|ロング(?!コート|スカート)/i,
  },
  {
    key: "tool",
    name: "アバター用ギミック・ツール",
    // 「ギミック」は【】の中に書かれているときだけ種別の名乗りとみなす。
    // 品名の途中に出るものは「シャンパンギミック」のような商品そのものの名前でありうる。
    // ponytail: 【】を使わない純粋なギミック商品は取りこぼす。既知の限界として残し、
    // 誤って衣装をギミックに数えるより取りこぼす側へ倒している
    pattern:
      /【[^】]*ギミック[^】]*】|システム|ツール|エディタ|ロコモーション|パーティクル|ポーズ|アニメーション|シェーダー|コンポーネント|\b(?:tools?|toolkit|system|editor|shaders?|particles?|locomotion|compressor|converter|optimizer|generator|prefab|animator)\b/i,
  },
]);

// 種別のkey(当たらなければ空文字)
function classifyItemKind(name) {
  const { base } = parseItemName(name);
  const text = base.replace(ITEM_KIND_IGNORE, "");
  if (!text) return "";
  const rule = ITEM_KIND_RULES.find((candidate) => candidate.pattern.test(text));
  const key = rule ? rule.key : "";
  // MA式のギミックはアバター用と分かっているので、種別なしと髪型より優先して拾う
  // (「MA式ヘアギミック」は髪の見た目ではなく仕掛け)。ワールド判定が先に当たって
  // いれば、そちらの方が確かなので触らない
  if ((key === "" || key === "hair") && ITEM_KIND_MA_GIMMICK.test(text)) return "tool";
  return key;
}

// 種別ごとの金額・点数。当たった種別だけを ITEM_KIND_RULES の並び順で返す
function aggregateByItemKind(results) {
  const rows = new Map();
  for (const result of results || []) {
    if (!Array.isArray(result.items)) continue;
    for (const item of result.items) {
      const key = classifyItemKind(item && item.name);
      if (!key) continue;
      if (!rows.has(key)) {
        const rule = ITEM_KIND_RULES.find((candidate) => candidate.key === key);
        rows.set(key, emptyAvatarRow(key, rule.name));
      }
      const row = rows.get(key);
      const quantity = itemQuantity(item);
      row.count += typeof quantity === "number" ? quantity : 0;
      if (item.name) row.items.add(item.name);
      const amount = itemAmount(item);
      if (amount === null) row.unknown++;
      else row.total += amount;
    }
  }
  return ITEM_KIND_RULES.filter((rule) => rows.has(rule.key)).map((rule) =>
    finishAvatarRow(rows.get(rule.key))
  );
}

// 手動割り当ての保存値。壊れた値や、この版に無いアバターの割り当てが混ざっていても
// 画面が壊れないよう、形だけを整える(知らないkeyは消さずに残す。辞書へ追加されれば
// また使えるようになるし、消すと本人の指定を黙って失うことになる)
function normalizeAvatarAssign(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, assigned] of Object.entries(value)) {
    if (typeof key === "string" && key && typeof assigned === "string" && assigned) {
      out[key] = assigned;
    }
  }
  return out;
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
  // D13 共有カードの月別棒グラフ用。1〜12月の並びで持つ(日付を読めない注文は入らない)
  const monthlyTotals = Array.from({ length: 12 }, () => 0);
  for (const result of valid) {
    const key = monthKeyOf(result.date);
    if (!key) continue;
    months.set(key, (months.get(key) || 0) + result.amount);
    const date = parseOrderDate(result.date);
    if (date) monthlyTotals[date.month - 1] += result.amount;
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
    monthlyTotals,
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

// ---- 配色テーマ --------------------------------------------------------
//
// 集計ページとポップアップが同じ設定(ストレージの boothTheme)に従う。
// 「システム」では :root から data-theme を外し、CSSの
// @media (prefers-color-scheme: dark) にそのまま任せる(端末の設定が
// 途中で変わっても、JSを介さずその場で切り替わる)。
//
// フラッシュ(誤ったテーマが一瞬見える現象)について。
// ext.storage.local の読み出しは非同期なので、最初の描画に間に合う保証が無い。
// 緩和策は2つ。
//  (1) CSSの既定を「端末の設定に従う」ままにしてある。既定値の「システム」を
//      使っている限り、JSが動く前から正しい配色で描かれる。
//  (2) 選択を localStorage(同期的に読める)へ写しておき、
//      applyMirroredTheme() を描画より前に呼んで先に当てる。
//      正となるのはあくまで ext.storage.local 側で、読み終わり次第 initTheme() が
//      上書きし、写しも取り直す。
// それでも「端末と違うテーマを選んでいて、かつ写しがまだ無い初回」だけは
// 一瞬もとの配色が見えることがある。これは同期的に読める拡張ストレージが無いため。
const THEME_VALUES = ["light", "dark", "system"];
const DEFAULT_THEME = "system";
const THEME_MIRROR_KEY = "boothThemeMirror"; // localStorage 側の写し(前述の緩和策)

// 保存値が壊れていても画面が壊れないよう、知らない値はすべて既定へ倒す
function normalizeTheme(value) {
  return THEME_VALUES.includes(value) ? value : DEFAULT_THEME;
}

// :root への反映。返り値は実際に当てたテーマ名
function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  const root = document.documentElement;
  if (normalized === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", normalized);
  return normalized;
}

// 今 :root に当たっているテーマ(属性が無ければ「システム」)
function currentAppliedTheme() {
  return normalizeTheme(document.documentElement.getAttribute("data-theme"));
}

// localStorage は使えない環境(無効化・容量超過)があるので、失敗しても無視する。
// 写しが無ければ既定の「システム」として扱われるだけで、正の値は storage 側にある
function writeThemeMirror(theme) {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch (e) {
    // 写せなくても動作に影響はない(フラッシュしやすくなるだけ)
  }
}

function readThemeMirror() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_MIRROR_KEY));
  } catch (e) {
    return DEFAULT_THEME;
  }
}

// 描画前に呼ぶ同期の先当て
function applyMirroredTheme() {
  return applyTheme(readThemeMirror());
}

async function loadTheme() {
  return normalizeTheme(await readStored(THEME_KEY, DEFAULT_THEME));
}

async function saveTheme(theme) {
  const normalized = normalizeTheme(theme);
  writeThemeMirror(normalized);
  await writeStored(THEME_KEY, normalized);
  return normalized;
}

// 読み込み時の適用。先に写しを当ててから、正の値で上書きする
async function initTheme() {
  applyMirroredTheme();
  const theme = await loadTheme();
  writeThemeMirror(theme);
  return applyTheme(theme);
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

// D14 手動割り当て。保存が無い環境(この機能より前の版)では空として扱う
async function loadAvatarAssign() {
  return normalizeAvatarAssign(await readStored(AVATAR_ASSIGN_KEY, {}));
}

function saveAvatarAssign(assignments) {
  return writeStored(AVATAR_ASSIGN_KEY, normalizeAvatarAssign(assignments));
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
const RUN_LOCK_TTL_MS = 45_000;

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

async function clearRunState(ownerId) {
  if (ownerId === undefined) return ext.storage.local.remove(RUN_STATE_KEY);
  const runState = await readStored(RUN_STATE_KEY, null);
  if (runState && runState.ownerId === ownerId) {
    await ext.storage.local.remove(RUN_STATE_KEY);
  }
}

function runLockIsActive(lock, now = Date.now()) {
  return Boolean(
    lock &&
      typeof lock.ownerId === "string" &&
      lock.ownerId &&
      typeof lock.expiresAt === "number" &&
      lock.expiresAt > now
  );
}

async function acquireRunLock(ownerId, now = Date.now()) {
  const current = await readStored(RUN_LOCK_KEY, null);
  if (runLockIsActive(current, now) && current.ownerId !== ownerId) return false;

  await writeStored(RUN_LOCK_KEY, {
    ownerId,
    acquiredAt: current && current.ownerId === ownerId ? current.acquiredAt : now,
    expiresAt: now + RUN_LOCK_TTL_MS,
  });
  const claimed = await readStored(RUN_LOCK_KEY, null);
  return Boolean(claimed && claimed.ownerId === ownerId && claimed.expiresAt > now);
}

async function refreshRunLock(ownerId, now = Date.now()) {
  const current = await readStored(RUN_LOCK_KEY, null);
  if (!runLockIsActive(current, now) || current.ownerId !== ownerId) return false;
  await writeStored(RUN_LOCK_KEY, { ...current, expiresAt: now + RUN_LOCK_TTL_MS });
  return true;
}

async function releaseRunLock(ownerId) {
  const current = await readStored(RUN_LOCK_KEY, null);
  if (current && current.ownerId === ownerId) {
    await ext.storage.local.remove(RUN_LOCK_KEY);
  }
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
