"use strict";

// BOOTHのページ(HTML)を読み取る処理だけを集めたファイル。
// DOMParserが作った不活性な文書を受け取り、素のデータを返すだけなので、
// 画面や保存の都合からは独立している。BOOTHの構造変更で直すのは基本ここ。

function extractOrderId(href) {
  const m = href.match(/\/orders\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ステータスはバッジのclassとして表される。見た目のためのclassが増減しても
// 取り違えないよう、まず既知のステータス名に一致するものを探す。
// キャンセルの除外がこの判定に乗っているので、取り違えると合計そのものが狂う
const BADGE_LAYOUT_CLASSES = new Set(["badge", "mx-0", "align-top", "order-state"]);

function extractStatusFromBadge(badgeEl) {
  if (!badgeEl) return "unknown";
  const classes = Array.from(badgeEl.classList);
  const known = classes.find((c) => c in STATUS_LABELS);
  if (known) return known;
  // 未知のステータスは、レイアウト用のclassを除いた残りをそのまま返す。
  // 集計対象からは外れない(除外はキャンセルだけ)ので、画面に出して気付けるようにする
  return classes.find((c) => !BADGE_LAYOUT_CLASSES.has(c)) || "unknown";
}

// 購入履歴一覧ページ1ページ分を解析し、注文の行情報と総ページ数を返す
function parseListPage(doc) {
  const rows = Array.from(
    doc.querySelectorAll('a.nav-reverse[href*="/orders/"]')
  );
  const orders = rows
    .map((a) => {
      const id = extractOrderId(a.getAttribute("href") || "");
      if (!id) return null;
      const badge = a.querySelector(".order-state");
      const status = extractStatusFromBadge(badge);
      const dateEl = a.querySelector(".u-tpg-caption2");
      const date = dateEl
        ? dateEl.textContent.replace(/^注文日時[:：]\s*/, "").trim()
        : "";
      return { id, status, date };
    })
    .filter(Boolean);

  let maxPage = 1;
  doc.querySelectorAll('.pager a[href*="page="]').forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });

  // ページ送りの枠自体があったかどうか。枠はあるのにページ番号を1つも読めない
  // 場合は「1ページしかない」ではなく「読めなかった」なので、呼び出し側で区別する
  return { orders, maxPage, pagerFound: doc.querySelector(".pager") !== null };
}

// 「BOOST¥ 0」のようにラベルと金額が同じ要素に入っている場合があるため、
// 文字列中の最初の「¥ 金額」を取り出す
function parseYenAmount(text) {
  const m = String(text == null ? "" : text).match(/[¥￥]\s*(-?[\d,]+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

// 注文詳細ページは、ショップごと・商品種別ごとに .sheet-group で区切られ、
// 各グループの先頭に「ダウンロード商品」「ギフト」などの見出しが入る。
// ギフトのグループに並ぶ商品価格(BOOST含む)を合計したものが、
// お支払金額に含まれるギフト分になる
const GIFT_GROUP_LABEL = "ギフト";

function parseGiftTotal(doc) {
  const groups = Array.from(doc.querySelectorAll(".sheet-group"));
  // グループ自体が見つからない場合はページ構造が変わっているので、
  // 「ギフト0円」と断定せず不明(null)として扱う
  if (groups.length === 0) return null;

  let total = 0;
  for (const group of groups) {
    const header = group.querySelector("b.u-tpg-title3");
    if (!header || header.textContent.trim() !== GIFT_GROUP_LABEL) continue;
    for (const cell of group.querySelectorAll(".u-tpg-caption1")) {
      const yen = parseYenAmount(cell.textContent);
      if (yen !== null) total += yen;
    }
  }
  return total;
}

// 注文詳細ページを解析し、実際の支払金額と、そこに含まれるギフト分を取得する。
// ステータスは一覧ページ(索引)側で読んだものを正とするため、ここでは読まない
function parseDetailPage(doc) {
  let amount = null;
  const labels = Array.from(doc.querySelectorAll("div")).filter(
    (d) => d.textContent.trim() === "お支払金額"
  );
  for (const label of labels) {
    const value = label.nextElementSibling;
    if (value) {
      const parsed = parseYenAmount(value.textContent);
      if (parsed !== null) {
        amount = parsed;
        break;
      }
    }
  }
  return { amount, gift: parseGiftTotal(doc) };
}
