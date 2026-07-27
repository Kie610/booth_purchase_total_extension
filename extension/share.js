"use strict";

// 𝕏で共有する文面と、そこへ添える共有カードの画像を組み立てるファイル。
//
// ストレージにもページのDOMにも触らない。集計済みの値を受け取り、文面の文字列と、
// 渡されたcanvasへの描画だけを行う。画面側の状態(開いている画面、選ばれている基準)は
// dashboard-view.js が持ち、ここへは値として渡す。
//
// 外部の画像・フォント・ライブラリを読み込まないこと。MV3はリモートコードを
// 禁じているため、読み込みを足すと拡張そのものが動かなくなる。

const RANKING_SORT_LABELS = { amount: "金額編", count: "購入数編" };

// ---- 共有文面 ----------------------------------------------------------

const SHARE_HASHTAG = "#BOOTHお買いものレポート";

// 合計以下の項目から最も高いものを選ぶ。マスターは金額の昇順で管理する。
// 最も安い項目にも届かない額のときは、何を選んでも「買えるくらい」が嘘になるので選ばない
function purchaseComparison(amount) {
  let selected = null;
  for (const example of PURCHASE_EXAMPLE_MASTER) {
    if (example.amount > amount) break;
    selected = example;
  }
  return selected ? selected.label : null;
}

// 全期間の合計を名乗ってよいのは、索引が最古まで揃っていて、かつ未収集も
// 残っていないときだけ。どちらか欠けたまま出すと、実際より少ない額を
// 「合計」として外に出すことになる
function canShareTotal(stats) {
  return stats.indexComplete && stats.pendingCount === 0;
}

// 合計を出せないときの確認文面。今年分は共有の前に収集してしまう
function shareConfirmMessage(stats) {
  const head = "未収集の注文が残っているため、全期間の合計は実際より少なくなります。\n";
  return stats.yearPendingCount > 0
    ? `${head}今年分の未収集 ${stats.yearPendingCount}件 を取得してから、今年の金額だけを共有します。\nよろしいですか?`
    : `${head}今年の金額だけを共有します。\nよろしいですか?`;
}

function buildShareText(stats) {
  // 合計を出せないときは今年の分だけにする。比較の基準も出した額に合わせないと、
  // 文面に無い金額をもとに「これが買える」と言うことになってしまう
  const full = canShareTotal(stats);
  const basis = full ? stats.total : stats.yearTotal;
  const comparison = purchaseComparison(basis);
  return [
    "BOOTHお買いもの振り返り🛍️",
    "",
    ...(full ? [`合計：${formatYen(stats.total)}（${stats.count}件）`] : []),
    `今年：${formatYen(stats.yearTotal)}（${stats.yearCount}件）`,
    // 比較できる額に届かないときは、この一段落ごと落とす
    ...(comparison
      ? ["", `積み重なって、${comparison}が買えるくらいの金額になったようですね`]
      : []),
    "",
    SHARE_HASHTAG,
  ].join("\n");
}

// ---- ランキングの共有 --------------------------------------------------

// 文面に載せる順位。表は10位まで出すが、投稿は長くなると読まれないので絞る
const RANKING_SHARE_LIMIT = 5;
const RANKING_MEDALS = ["🥇", "🥈", "🥉"];

function rankingShareValue(row, sort) {
  return sort === "count" ? `${row.count}点` : formatYen(row.total);
}

function buildRankingShareText(stats, hideNumbers) {
  const label = RANKING_SORT_LABELS[stats.sort];
  return [
    `BOOTHの推し作者ランキング🛍️（${label}）`,
    "",
    ...stats.rows.map((row, index) => {
      const rank = RANKING_MEDALS[index] || `${index + 1}.`;
      return hideNumbers
        ? `${rank} ${row.name}`
        : `${rank} ${row.name} ${rankingShareValue(row, stats.sort)}`;
    }),
    // 画面では断り書きを出している。数字を外に出すときは文面にも同じ断りを付ける
    ...(hideNumbers || stats.sort !== "amount"
      ? []
      : ["", "※金額は商品の合計（送料・クーポンを除く）"]),
    "",
    SHARE_HASHTAG,
  ].join("\n");
}

// 順位がずれうる理由。無ければ空配列で、そのまま共有してよい
function rankingShareIssues(stats) {
  const issues = [];
  if (stats.pending > 0) issues.push(`未収集の注文が${stats.pending}件あります`);
  if (!stats.indexComplete) issues.push("注文履歴の取得が途中で終わっています");
  // 金額を読めなかった商品は点数には入っているので、購入数編では順位に響かない
  if (stats.sort === "amount" && stats.unknown > 0) {
    issues.push(`金額を読み取れなかった商品が${stats.unknown}点あります`);
  }
  return issues;
}

function rankingShareConfirmMessage(stats) {
  return (
    `${rankingShareIssues(stats).join("。")}。\n` +
    "このまま共有すると、順位や数字が実際とは違うことがあります。\n" +
    "よろしいですか?"
  );
}

// ---- 今年のまとめの共有 ------------------------------------------------

function buildSummaryShareText(stats) {
  const lines = [
    `${stats.year}年のBOOTHお買いもの🛍️`,
    "",
    `支払い ${formatYen(stats.total)}（${stats.orderCount}件）`,
    `買ったもの ${stats.itemCount}点`,
    `支援した作者 ${stats.shopCount}人`,
  ];
  // はじめて買った作者がいない年に「はじめて 0人」と出すと寂しいだけなので落とす
  if (stats.newShopCount > 0) lines.push(`うちはじめて ${stats.newShopCount}人`);
  if (stats.boost > 0) lines.push(`BOOSTの上乗せ ${formatYen(stats.boost)}`);
  if (stats.busiestMonth) lines.push(`いちばん買った月 ${monthLabel(stats.busiestMonth.key)}`);
  if (stats.topShops.length > 0) {
    lines.push("", "推し作者");
    stats.topShops.forEach((row, index) => {
      lines.push(`${RANKING_MEDALS[index] || `${index + 1}.`} ${row.name}`);
    });
  }
  lines.push("", SHARE_HASHTAG);
  return lines.join("\n");
}

// まとめの数字がずれる理由。ランキングと同じく、出す前に本人へ断る
function summaryShareIssues(stats) {
  const issues = [];
  if (stats.pendingCount > 0) {
    issues.push(`${stats.year}年に未収集の注文が${stats.pendingCount}件あります`);
  }
  // 過去が未収集だと、前から買っていた作者を「はじめて」に数えてしまう
  if (stats.beforePending > 0 && stats.newShopCount > 0) {
    issues.push(`それ以前の未収集が${stats.beforePending}件あり、「はじめて」を多く数えることがあります`);
  }
  return issues;
}

function summaryShareConfirmMessage(stats) {
  return (
    `${summaryShareIssues(stats).join("。")}。\n` +
    "このまま共有すると、数字が実際とは違うことがあります。\n" +
    "よろしいですか?"
  );
}

// 𝕏のタイムラインで切り取られない比率(16:9)。実寸は投稿後の縮小を見込んで大きめ
const SHARE_CARD_WIDTH = 1200;
const SHARE_CARD_HEIGHT = 675;
const SHARE_CARD_PADDING = 72;

const SHARE_CARD_FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

// 背景の明るさで文字色を変える。写真の上では薄い灰色が沈むので、白と半透明の白を使う
const SHARE_CARD_THEMES = {
  light: { fg: "#2a2f36", muted: "#6b7280", accent: "#fc4d50", line: "#e2e5ea" },
  dark: { fg: "#ffffff", muted: "rgba(255,255,255,0.78)", accent: "#ffd7d8", line: "rgba(255,255,255,0.3)" },
};

// ---- カードの中身を組む ------------------------------------------------
//
// 文面と同じ集計値から組む。カードのために集計し直すと、投稿の本文と画像で
// 違う数字を出しかねない。

function shareCardBase(title, subtitle) {
  return { title, subtitle, stats: [], list: [], note: "" };
}

function buildTotalShareCard(stats) {
  const full = canShareTotal(stats);
  const card = shareCardBase(
    full ? "BOOTHお買いもの振り返り" : `${stats.year}年のBOOTHお買いもの`,
    "BOOTHお買いものレポート"
  );
  if (full) {
    card.stats.push({ label: "合計", value: formatYen(stats.total), note: `${stats.count}件` });
  }
  card.stats.push({
    label: `${stats.year}年`,
    value: formatYen(stats.yearTotal),
    note: `${stats.yearCount}件`,
  });
  const comparison = purchaseComparison(full ? stats.total : stats.yearTotal);
  if (comparison) card.note = `${comparison}が買えるくらいの金額`;
  return card;
}

function buildRankingShareCard(stats, hideNumbers) {
  const card = shareCardBase(
    `推し作者ランキング（${RANKING_SORT_LABELS[stats.sort]}）`,
    "BOOTHお買いものレポート"
  );
  card.list = stats.rows.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    value: hideNumbers ? "" : rankingShareValue(row, stats.sort),
  }));
  // 画面と文面に出している断りは画像にも要る。画像だけが転載されることがある
  if (!hideNumbers && stats.sort === "amount") {
    card.note = "金額は商品の合計（送料・クーポンを除く）";
  }
  return card;
}

function buildSummaryShareCard(stats) {
  const card = shareCardBase(`${stats.year}年のお買いもの`, "BOOTHお買いものレポート");
  card.stats.push({
    label: "支払い",
    value: formatYen(stats.total),
    note: `${stats.orderCount}件`,
  });
  card.stats.push({ label: "買ったもの", value: `${stats.itemCount}点`, note: "" });
  card.stats.push({
    label: "支援した作者",
    value: `${stats.shopCount}人`,
    note: stats.newShopCount > 0 ? `はじめて ${stats.newShopCount}人` : "",
  });
  if (stats.boost > 0) {
    card.stats.push({ label: "BOOSTの上乗せ", value: formatYen(stats.boost), note: "" });
  }
  card.list = stats.topShops.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    value: "",
  }));
  return card;
}

// ---- 描画 --------------------------------------------------------------

// 金額や点数は切ってはいけない。「¥184,3…」では額そのものが変わってしまうので、
// 収まらないときは文字を小さくする。指定した大きさで ctx.font を決めて返す
function fitFontSize(ctx, text, maxWidth, sizes, weight) {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${SHARE_CARD_FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
}

// 収まらない名前は切って「…」を付ける。はみ出すと隣の数字に重なって読めなくなる
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

// 背景画像は縦横比を保ったまま全面を覆う(cover)。引き伸ばすと人物や絵が歪む
function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawShareCardBackground(ctx, background) {
  if (background) {
    drawCover(ctx, background, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    // どんな写真でも文字が読めるように暗く敷く。これが無いと明るい画像で白文字が消える
    ctx.fillStyle = "rgba(20, 16, 24, 0.58)";
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    return "dark";
  }
  const gradient = ctx.createLinearGradient(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  gradient.addColorStop(0, "#f6e6ff");
  gradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  return "light";
}

function drawShareCard(ctx, card, background) {
  const theme = SHARE_CARD_THEMES[drawShareCardBackground(ctx, background)];
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const left = SHARE_CARD_PADDING;
  const right = SHARE_CARD_WIDTH - SHARE_CARD_PADDING;
  let y = SHARE_CARD_PADDING + 34;

  ctx.fillStyle = theme.muted;
  ctx.font = `24px ${SHARE_CARD_FONT}`;
  ctx.fillText(card.subtitle, left, y);

  y += 68;
  ctx.fillStyle = theme.fg;
  ctx.font = `bold 54px ${SHARE_CARD_FONT}`;
  ctx.fillText(fitText(ctx, card.title, right - left), left, y);

  y += 26;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, y, 96, 6);

  // 数字は横に並べる。段組にすると1項目のときに空白が目立つ
  if (card.stats.length > 0) {
    y += 96;
    const columnWidth = (right - left) / card.stats.length;
    // 隣の数字とくっつかないよう、列の間を空けたぶんだけ使える幅を狭める
    const textWidth = columnWidth - 24;
    card.stats.forEach((stat, index) => {
      const x = left + columnWidth * index;
      ctx.fillStyle = theme.muted;
      ctx.font = `24px ${SHARE_CARD_FONT}`;
      ctx.fillText(fitText(ctx, stat.label, textWidth), x, y);

      ctx.fillStyle = theme.fg;
      fitFontSize(ctx, stat.value, textWidth, [52, 44, 38, 32], "bold");
      ctx.fillText(stat.value, x, y + 62);

      if (stat.note) {
        ctx.fillStyle = theme.muted;
        ctx.font = `22px ${SHARE_CARD_FONT}`;
        ctx.fillText(fitText(ctx, stat.note, textWidth), x, y + 98);
      }
    });
    y += 120;
  }

  if (card.list.length > 0) {
    // 数字の下に並べるときは詰める。最後の行が下段の断り書きに重なるため
    if (card.stats.length > 0) {
      // 数字と作者名は読む単位が違う。細い線で切って、続きだと分かるようにする
      ctx.fillStyle = theme.line;
      ctx.fillRect(left, y + 4, right - left, 1);
    }
    y += card.stats.length > 0 ? 44 : 88;
    for (const row of card.list) {
      ctx.fillStyle = theme.accent;
      ctx.font = `bold 34px ${SHARE_CARD_FONT}`;
      ctx.fillText(`${row.rank}`, left, y);

      // 金額を先に測り、名前が入れる幅を残す
      ctx.font = `30px ${SHARE_CARD_FONT}`;
      const valueWidth = row.value ? ctx.measureText(row.value).width : 0;
      ctx.fillStyle = theme.fg;
      ctx.font = `bold 36px ${SHARE_CARD_FONT}`;
      ctx.fillText(fitText(ctx, row.name, right - left - 56 - valueWidth - 32), left + 56, y);

      if (row.value) {
        ctx.fillStyle = theme.muted;
        ctx.font = `30px ${SHARE_CARD_FONT}`;
        ctx.textAlign = "right";
        ctx.fillText(row.value, right, y);
        ctx.textAlign = "left";
      }
      y += 60;
    }
  }

  // 断り書きとハッシュタグは常に最下段。上の行数で位置が動くと落ち着かない
  const bottom = SHARE_CARD_HEIGHT - SHARE_CARD_PADDING;
  if (card.note) {
    ctx.fillStyle = theme.muted;
    ctx.font = `22px ${SHARE_CARD_FONT}`;
    ctx.fillText(fitText(ctx, card.note, right - left - 320), left, bottom - 8);
  }
  ctx.fillStyle = theme.muted;
  ctx.font = `24px ${SHARE_CARD_FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(SHARE_HASHTAG, right, bottom - 8);
  ctx.textAlign = "left";
}
