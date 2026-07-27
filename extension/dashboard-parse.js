"use strict";

// BOOTHのページ(HTML)を読み取る処理だけを集めたファイル。
// DOMParserが作った不活性な文書を受け取り、素のデータを返すだけなので、
// 画面や保存の都合からは独立している。BOOTHの構造変更で直すのは基本ここ。

function extractOrderId(href) {
  const m = href.match(/\/orders\/([^/?#]+)/);
  return m ? m[1] : null;
}

function extractStatusFromBadge(badgeEl) {
  if (!badgeEl) return "unknown";
  const known = new Set(["badge", "mx-0", "align-top", "order-state"]);
  const token = Array.from(badgeEl.classList).find((c) => !known.has(c));
  return token || "unknown";
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

  return { orders, maxPage };
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

// 注文詳細ページを解析し、実際の支払金額と、そこに含まれるギフト分を取得する
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
  const badge = doc.querySelector(".order-state");
  const status = extractStatusFromBadge(badge);
  return { amount, gift: parseGiftTotal(doc), status };
}
