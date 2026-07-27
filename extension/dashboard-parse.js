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

// 注文詳細ページの構造(実ページで確認済み)。
//
//   div.l-order-detail-by-shop                      ショップごとの区切り
//     div.l-order-detail-sheet-group-header
//       b > a.nav.u-tpg-title3                      ショップ名(hrefがショップのURL)
//     div.sheet-group                               商品種別ごとの区切り
//       div.sheet   > b.u-tpg-title3                「ダウンロード商品」「ギフト」
//       div.sheet                                   商品1件
//         a.nav[href*="/items/"]                    商品名
//         div.u-tpg-caption1                        価格   "¥ 425"
//         div.u-tpg-caption1 > .particulars-heading BOOST  "BOOST¥ 0"
//
// 同じショップのダウンロード商品とギフトは、別の .sheet-group でありながら
// 同じ .l-order-detail-by-shop の下に並ぶ。ショップ名はグループではなく
// こちらの区切りに1つだけ入るため、ショップの特定は必ず外側から行う。
//
// 領収書の枠も .l-order-detail-by-shop と .sheet-group を使い回しているが、
// ショップ名の見出しも商品リンクも持たない。商品リンクの有無で選り分ける。
const SHOP_SECTION_SELECTOR = ".l-order-detail-by-shop";
const SHOP_NAME_SELECTOR = ".l-order-detail-sheet-group-header a";
const ITEM_LINK_SELECTOR = 'a.nav[href*="/items/"]';
const GIFT_GROUP_LABEL = "ギフト";

// 商品1件分。価格を読めなかった場合は0と断定せず null(不明)にする
function parseItemSheet(sheet, shop, gift) {
  const link = sheet.querySelector(ITEM_LINK_SELECTOR);
  if (!link) return null;

  let price = null;
  let boost = 0;
  for (const cell of sheet.querySelectorAll(".u-tpg-caption1")) {
    // ダウンロードファイル名の行も同じclassを使っているが、金額を含まない
    const yen = parseYenAmount(cell.textContent);
    if (yen === null) continue;
    if (cell.querySelector(".particulars-heading")) {
      boost = yen;
    } else if (price === null) {
      price = yen;
    }
  }

  return {
    shop: shop.name,
    shopUrl: shop.url,
    name: link.textContent.trim(),
    price,
    boost,
    gift,
  };
}

// 注文に含まれる商品を、ショップ名とギフトかどうかを添えて取り出す。
// 商品を1件も見つけられない場合は、ページ構造が変わった可能性があるので
// 「商品なし」と断定せず null(不明)を返す
function parseOrderItems(doc) {
  const items = [];
  for (const section of doc.querySelectorAll(SHOP_SECTION_SELECTOR)) {
    const link = section.querySelector(SHOP_NAME_SELECTOR);
    const shop = {
      name: link ? link.textContent.trim() : "",
      // 表示名は変わることがあるので、集計の同一性はURLで判断できるようにしておく
      url: link ? link.getAttribute("href") || "" : "",
    };
    for (const group of section.querySelectorAll(".sheet-group")) {
      const header = group.querySelector("b.u-tpg-title3");
      if (!header) continue;
      const gift = header.textContent.trim() === GIFT_GROUP_LABEL;
      for (const sheet of group.querySelectorAll(".sheet")) {
        const item = parseItemSheet(sheet, shop, gift);
        if (item) items.push(item);
      }
    }
  }
  return items.length > 0 ? items : null;
}

// 注文詳細ページを解析する。
// お支払金額は注文単位の値をそのまま読む(商品の合計で代用しない。
// 送料やクーポンが絡む注文で一致する保証が無く、静かに合計がずれるため)。
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
  const items = parseOrderItems(doc);
  return { amount, gift: giftTotalOfItems(items), items };
}
