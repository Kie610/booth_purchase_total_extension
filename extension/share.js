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
    `合計額 ${formatYen(stats.total)}（${stats.orderCount}件）`,
    `買ったもの ${stats.itemCount}点`,
    `支援した作者 ${stats.shopCount}人`,
  ];
  // はじめて買った作者がいない年に「はじめて 0人」と出すと寂しいだけなので落とす
  if (stats.newShopCount > 0) lines.push(`うちはじめて ${stats.newShopCount}人`);
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

// 投稿先に合わせて選べる縦横比。実寸は投稿後の縮小を見込んで大きめに取る。
// 既定は𝕏のタイムラインで切り取られない16:9
const SHARE_RATIOS = {
  "16:9": { width: 1200, height: 675 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1200, height: 900 },
  "3:4": { width: 900, height: 1200 },
};
const DEFAULT_SHARE_RATIO = "16:9";
const SHARE_CARD_WIDTH = SHARE_RATIOS[DEFAULT_SHARE_RATIO].width;
const SHARE_CARD_HEIGHT = SHARE_RATIOS[DEFAULT_SHARE_RATIO].height;

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
    card.stats.push({ label: "合計額", value: formatYen(stats.total), note: `${stats.count}件` });
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
    label: "合計額",
    value: formatYen(stats.total),
    note: `${stats.orderCount}件`,
  });
  card.stats.push({ label: "買ったもの", value: `${stats.itemCount}点`, note: "" });
  card.stats.push({
    label: "支援した作者",
    value: `${stats.shopCount}人`,
    note: stats.newShopCount > 0 ? `はじめて ${stats.newShopCount}人` : "",
  });
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

// ---- 背景 --------------------------------------------------------------

// アップロードした画像が無いときに選べる下地。外部の画像を読まず、
// すべてその場でcanvasへ描く(MV3のリモートコード禁止に触れないため)。
// 明るい下地は濃い文字、濃い下地は白文字にしたいので、組ごとに theme を持つ。

function fillLinearGradient(ctx, width, height, from, to) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// 柄は「下地を塗ってから、薄い色で図形を敷き詰める」形にそろえる
function tintedShapes(ctx, width, height, base, ink, draw) {
  fillLinearGradient(ctx, width, height, base[0], base[1]);
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  draw(ctx, width, height);
  ctx.restore();
}

const SHARE_TEMPLATE_COLORS = [
  ["red", "赤", "#ffe1e1", "#fff6f6"],
  ["orange", "オレンジ", "#ffe8d2", "#fff8f1"],
  ["pink", "ピンク", "#ffe0ef", "#fff5fa"],
  ["yellow", "黄", "#fff4cc", "#fffdf2"],
  ["green", "緑", "#ddf4e2", "#f5fcf7"],
  ["blue", "青", "#dcecff", "#f4f9ff"],
  ["purple", "紫", "#f0e2ff", "#faf5ff"],
];

// 柄の下地は一色に寄せる。柄と色の両方を選ばせるとUIが増えるので、
// 柄は「模様が主役」、色は「無地の色が主役」と役割を分ける
const PATTERN_BASE = ["#f4f1fa", "#ffffff"];
const PATTERN_INK = "rgba(120, 92, 160, 0.16)";

const SHARE_TEMPLATE_PATTERNS = [
  [
    "dots",
    "水玉",
    (ctx, w, h) => {
      for (let y = 40; y < h; y += 72) {
        for (let x = 40; x < w; x += 72) {
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  ],
  [
    "stripes",
    "ストライプ",
    (ctx, w, h) => {
      ctx.lineWidth = 18;
      for (let x = -h; x < w; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + h, 0);
        ctx.stroke();
      }
    },
  ],
  [
    "grid",
    "チェック",
    (ctx, w, h) => {
      ctx.lineWidth = 6;
      for (let x = 0; x < w; x += 72) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 72) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
  ],
  [
    "checker",
    "市松",
    (ctx, w, h) => {
      const size = 60;
      for (let row = 0; row * size < h; row += 1) {
        for (let col = row % 2; col * size < w; col += 2) {
          ctx.fillRect(col * size, row * size, size, size);
        }
      }
    },
  ],
  [
    "waves",
    "波",
    (ctx, w, h) => {
      ctx.lineWidth = 8;
      for (let y = 40; y < h + 80; y += 64) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const wy = y + Math.sin(x / 48) * 14;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
    },
  ],
  [
    "confetti",
    "紙ふぶき",
    (ctx, w, h) => {
      // 位置は式で決める。乱数だと描き直すたびに柄が変わってしまう
      for (let i = 0; i < 90; i += 1) {
        const x = ((i * 137) % w) + (i % 7) * 11;
        const y = ((i * 89) % h) + (i % 5) * 13;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((i % 6) * 0.5);
        ctx.fillRect(-14, -5, 28, 10);
        ctx.restore();
      }
    },
  ],
  [
    "rays",
    "放射",
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const far = Math.hypot(w, h);
      for (let i = 0; i < 24; i += 1) {
        const a = (Math.PI * 2 * i) / 24;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, far, a, a + Math.PI / 48);
        ctx.closePath();
        ctx.fill();
      }
    },
  ],
];

const SHARE_TEMPLATES = [
  ...SHARE_TEMPLATE_COLORS.map(([id, label, from, to]) => ({
    id: `color-${id}`,
    group: "color",
    label,
    theme: "light",
    draw: (ctx, w, h) => fillLinearGradient(ctx, w, h, from, to),
  })),
  ...SHARE_TEMPLATE_PATTERNS.map(([id, label, draw]) => ({
    id: `pattern-${id}`,
    group: "pattern",
    label,
    theme: "light",
    draw: (ctx, w, h) => tintedShapes(ctx, w, h, PATTERN_BASE, PATTERN_INK, draw),
  })),
];

function shareTemplateById(id) {
  return SHARE_TEMPLATES.find((template) => template.id === id) || null;
}

// 背景画像は縦横比を保ったまま全面を覆う(cover)。引き伸ばすと人物や絵が歪む
function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

// アップロードした画像が最優先。次にテンプレート、どちらも無ければ既定の下地
function drawShareCardBackground(ctx, background, width, height, template) {
  if (background) {
    drawCover(ctx, background, width, height);
    // どんな写真でも文字が読めるように暗く敷く。これが無いと明るい画像で白文字が消える
    ctx.fillStyle = "rgba(20, 16, 24, 0.58)";
    ctx.fillRect(0, 0, width, height);
    return "dark";
  }
  if (template) {
    template.draw(ctx, width, height);
    return template.theme;
  }
  fillLinearGradient(ctx, width, height, "#f6e6ff", "#ffffff");
  return "light";
}

// ---- 組み方 ------------------------------------------------------------

// 縦横比ごとの組み方。**余白だけ変えると、正方形や縦長では上に固まって間延びする。**
// 文字の大きさ・数字の並べ方・行間を比率ごとに決め、余った高さは spread で配る。
const SHARE_CARD_LAYOUTS = {
  "16:9": { statsPerRow: 4, subtitle: 24, title: 54, statLabel: 24, statValues: [52, 44, 38, 32], statNote: 22, statRow: 132, listRank: 34, listName: 36, listValue: 30, listStep: 60, spread: false },
  "4:3": { statsPerRow: 2, subtitle: 26, title: 58, statLabel: 26, statValues: [58, 50, 42, 36], statNote: 24, statRow: 148, listRank: 36, listName: 40, listValue: 32, listStep: 68, spread: true },
  "1:1": { statsPerRow: 2, subtitle: 26, title: 56, statLabel: 26, statValues: [56, 48, 40, 34], statNote: 24, statRow: 148, listRank: 36, listName: 38, listValue: 32, listStep: 68, spread: true },
  "3:4": { statsPerRow: 2, subtitle: 24, title: 48, statLabel: 24, statValues: [50, 42, 36, 30], statNote: 22, statRow: 140, listRank: 32, listName: 34, listValue: 28, listStep: 62, spread: true },
};

function shareCardLayout(width, height) {
  const name = Object.keys(SHARE_RATIOS).find(
    (key) => SHARE_RATIOS[key].width === width && SHARE_RATIOS[key].height === height
  );
  return SHARE_CARD_LAYOUTS[name] || SHARE_CARD_LAYOUTS[DEFAULT_SHARE_RATIO];
}

// 大きさは canvas から読む。縦横比を選べるので寸法を決め打ちしない
function drawShareCard(ctx, card, background, template) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const padding = Math.round(width * 0.06);
  const layout = shareCardLayout(width, height);
  const theme =
    SHARE_CARD_THEMES[drawShareCardBackground(ctx, background, width, height, template)];
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const left = padding;
  const right = width - padding;
  const bottom = height - padding;
  let y = padding + layout.subtitle + 10;

  ctx.fillStyle = theme.muted;
  ctx.font = `${layout.subtitle}px ${SHARE_CARD_FONT}`;
  ctx.fillText(card.subtitle, left, y);

  y += layout.title + 14;
  ctx.fillStyle = theme.fg;
  ctx.font = `bold ${layout.title}px ${SHARE_CARD_FONT}`;
  ctx.fillText(fitText(ctx, card.title, right - left), left, y);

  y += 26;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, y, 96, 6);

  // 縦長や正方形では下が余る。余りを段の間へ配って、中身を縦に散らす
  const statRows = card.stats.length > 0 ? Math.ceil(card.stats.length / layout.statsPerRow) : 0;
  const needed = statRows * layout.statRow + card.list.length * layout.listStep;
  const gaps = (statRows > 0 ? 1 : 0) + (card.list.length > 0 ? 1 : 0);
  const spare =
    layout.spread && gaps > 0
      ? Math.max(0, (bottom - 56 - y - needed - 140) / gaps)
      : 0;

  if (card.stats.length > 0) {
    y += 96 + spare;
    const perRow = Math.min(layout.statsPerRow, card.stats.length);
    const columnWidth = (right - left) / perRow;
    // 隣の数字とくっつかないよう、列の間を空けたぶんだけ使える幅を狭める
    const textWidth = columnWidth - 24;
    card.stats.forEach((stat, index) => {
      const x = left + columnWidth * (index % perRow);
      const top = y + layout.statRow * Math.floor(index / perRow);

      ctx.fillStyle = theme.muted;
      ctx.font = `${layout.statLabel}px ${SHARE_CARD_FONT}`;
      ctx.fillText(fitText(ctx, stat.label, textWidth), x, top);

      ctx.fillStyle = theme.fg;
      fitFontSize(ctx, stat.value, textWidth, layout.statValues, "bold");
      ctx.fillText(stat.value, x, top + layout.statValues[0] + 10);

      if (stat.note) {
        ctx.fillStyle = theme.muted;
        ctx.font = `${layout.statNote}px ${SHARE_CARD_FONT}`;
        ctx.fillText(fitText(ctx, stat.note, textWidth), x, top + layout.statValues[0] + 46);
      }
    });
    y += layout.statRow * statRows - 12;
  }

  if (card.list.length > 0) {
    if (card.stats.length > 0) {
      // 数字と作者名は読む単位が違う。細い線で切って、続きだと分かるようにする
      ctx.fillStyle = theme.line;
      ctx.fillRect(left, y + 4, right - left, 1);
    }
    y += (card.stats.length > 0 ? 44 : 88) + spare;
    for (const row of card.list) {
      ctx.fillStyle = theme.accent;
      ctx.font = `bold ${layout.listRank}px ${SHARE_CARD_FONT}`;
      ctx.fillText(`${row.rank}`, left, y);

      // 金額を先に測り、名前が入れる幅を残す
      ctx.font = `${layout.listValue}px ${SHARE_CARD_FONT}`;
      const valueWidth = row.value ? ctx.measureText(row.value).width : 0;
      ctx.fillStyle = theme.fg;
      ctx.font = `bold ${layout.listName}px ${SHARE_CARD_FONT}`;
      ctx.fillText(fitText(ctx, row.name, right - left - 56 - valueWidth - 32), left + 56, y);

      if (row.value) {
        ctx.fillStyle = theme.muted;
        ctx.font = `${layout.listValue}px ${SHARE_CARD_FONT}`;
        ctx.textAlign = "right";
        ctx.fillText(row.value, right, y);
        ctx.textAlign = "left";
      }
      y += layout.listStep;
    }
  }

  // 断り書きとハッシュタグは常に最下段。上の行数で位置が動くと落ち着かない
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
