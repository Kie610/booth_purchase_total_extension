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

// 背景の明るさで文字色を変える。写真の上では薄い灰色が沈むので、白と半透明の白を使う。
// value は順位表に並ぶ金額・購入数の色。muted のままだと作者名に対して薄く、
// 数字だけが読み取りにくかったので、本文(fg)寄りの濃さを別に持たせている
const SHARE_CARD_THEMES = {
  light: { fg: "#2a2f36", muted: "#6b7280", value: "#39414b", accent: "#fc4d50", line: "#e2e5ea" },
  dark: {
    fg: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    value: "rgba(255,255,255,0.95)",
    accent: "#ffd7d8",
    line: "rgba(255,255,255,0.3)",
  },
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
//
// **色と模様は別々に選び、その組み合わせで下地になる。** 模様は赤(色相0)で
// 一度だけ組み、他の色はHSVの**色相だけを回して**作る。色ごとに描き分けると、
// 同じ模様でも色によって太さや間隔が食い違い、選び直したときに別の模様に見える。

function fillLinearGradient(ctx, width, height, from, to) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// HSV(色相0-360、彩度・明度0-1)をcanvasへ渡せる文字列にする。
// 色の指定をHSVでそろえるのは、色相だけを差し替えて同じ濃さの色を作るため
function hsvColor(hue, saturation, value, alpha) {
  const h = ((hue % 360) + 360) % 360;
  const c = value * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = value - c;
  const table = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor(h / 60) % 6];
  const to255 = (n) => Math.round((n + m) * 255);
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

// 赤で組んだときの彩度・明度。下地は薄く、模様のインクだけ濃くする。
// ここを1か所に持つので、色を足すときは色相を1行足すだけで濃さがそろう
const TEMPLATE_HSV = {
  from: { s: 0.16, v: 1 },
  to: { s: 0.04, v: 1 },
  ink: { s: 0.52, v: 0.86, a: 0.3 },
};

function templatePalette(hue) {
  return {
    from: hsvColor(hue, TEMPLATE_HSV.from.s, TEMPLATE_HSV.from.v, 1),
    to: hsvColor(hue, TEMPLATE_HSV.to.s, TEMPLATE_HSV.to.v, 1),
    ink: hsvColor(hue, TEMPLATE_HSV.ink.s, TEMPLATE_HSV.ink.v, TEMPLATE_HSV.ink.a),
  };
}

const SHARE_TEMPLATE_COLORS = [
  { id: "red", label: "赤", hue: 0 },
  { id: "orange", label: "オレンジ", hue: 28 },
  { id: "yellow", label: "黄", hue: 48 },
  { id: "green", label: "緑", hue: 138 },
  { id: "blue", label: "青", hue: 210 },
  { id: "purple", label: "紫", hue: 278 },
  { id: "pink", label: "ピンク", hue: 330 },
];

// 模様の基準となる間隔。実寸(1200x675)で72px前後になるよう対角線から出す。
// 見本のボタンでは別の値を渡す(下の SHARE_PREVIEW_STEP)
function patternStep(width, height) {
  return Math.max(6, Math.round(Math.hypot(width, height) * 0.052));
}

// 見本は小さいので、実寸と同じ間隔で描くと模様が1つ2つしか入らず、
// 何の模様か分からない。見本だけ間隔を詰めて4つ前後を見せる。
// **描画関数は実物と同じものを使う**(別に持つと実物と食い違っても気付けない)
const SHARE_PREVIEW_STEP = 22;

// 模様は canvas の**中心を原点**にして敷く。端から順に敷くと、幅や高さで
// 割り切れないぶんが片側に余り、16:9では右へ寄って見える。
// 中心から両側へ伸ばせば、どの比率でも中心について点対称になる。
// フレークだけは散らばりが持ち味なので対称にしない

function patternDots(ctx, w, h, step) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = step * 0.17;
  const nx = Math.ceil(cx / step);
  const ny = Math.ceil(cy / step);
  for (let j = -ny; j <= ny; j += 1) {
    for (let i = -nx; i <= nx; i += 1) {
      ctx.beginPath();
      ctx.arc(cx + i * step, cy + j * step, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function patternStripes(ctx, w, h, step) {
  // x+y=c の斜線。中心を通る線を基準に、両側へ同じ本数ずつ足す
  const center = w / 2 + h / 2;
  const span = Math.ceil((w + h) / (2 * step));
  ctx.lineWidth = step * 0.25;
  for (let k = -span; k <= span; k += 1) {
    const c = center + k * step;
    ctx.beginPath();
    ctx.moveTo(c - h, h);
    ctx.lineTo(c, 0);
    ctx.stroke();
  }
}

function patternGrid(ctx, w, h, step) {
  const cx = w / 2;
  const cy = h / 2;
  const nx = Math.ceil(cx / step);
  const ny = Math.ceil(cy / step);
  ctx.lineWidth = Math.max(1, step * 0.09);
  for (let i = -nx; i <= nx; i += 1) {
    const x = cx + i * step;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let j = -ny; j <= ny; j += 1) {
    const y = cy + j * step;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function patternChecker(ctx, w, h, step) {
  // 中心に格子の交点を置くと、(i,j)のマスは点対称の位置にある
  // (-i-1,-j-1)へ移り、i+jの偶奇が変わらないので市松のまま重なる
  const cx = w / 2;
  const cy = h / 2;
  const nx = Math.ceil(cx / step) + 1;
  const ny = Math.ceil(cy / step) + 1;
  for (let j = -ny; j <= ny; j += 1) {
    for (let i = -nx; i <= nx; i += 1) {
      if ((i + j) % 2 !== 0) continue;
      ctx.fillRect(cx + i * step, cy + j * step, step, step);
    }
  }
}

function patternWaves(ctx, w, h, step) {
  const cx = w / 2;
  const cy = h / 2;
  const amp = step * 0.2;
  const length = step * 0.67;
  const sample = Math.max(2, step / 8);
  const ny = Math.ceil((cy + amp) / step) + 1;
  ctx.lineWidth = Math.max(1, step * 0.11);
  // 位相を中心から測る。sinは奇関数なので、これで上下の段が点対称になる
  const waveY = (x, j) => cy + j * step + Math.sin((x - cx) / length) * amp;
  for (let j = -ny; j <= ny; j += 1) {
    ctx.beginPath();
    ctx.moveTo(0, waveY(0, j));
    for (let x = sample; x < w; x += sample) ctx.lineTo(x, waveY(x, j));
    // **右端は必ず打つ。** 幅が刻み幅で割り切れないと右だけ線が途切れ、
    // 左右で見え方が変わってしまう
    ctx.lineTo(w, waveY(w, j));
    ctx.stroke();
  }
}

function patternFlakes(ctx, w, h, step) {
  // 位置は式で決める。乱数だと描き直すたびに柄が変わってしまう。
  // 散らばりが持ち味なので、ここだけは点対称にしない
  const count = Math.round(((w * h) / (step * step)) * 0.8);
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 137) % w) + ((i % 7) * step) / 6;
    const y = ((i * 89) % h) + ((i % 5) * step) / 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((i % 6) * 0.5);
    ctx.fillRect(-step * 0.25, -step * 0.09, step * 0.5, step * 0.18);
    ctx.restore();
  }
}

// draw が null のものは下地のグラデーションだけ。模様を足すときはここへ1行
const SHARE_TEMPLATE_PATTERNS = [
  { id: "gradient", label: "グラデーション", draw: null },
  { id: "dots", label: "水玉", draw: patternDots },
  { id: "stripes", label: "斜めストライプ", draw: patternStripes },
  { id: "grid", label: "格子", draw: patternGrid },
  { id: "checker", label: "市松", draw: patternChecker },
  { id: "waves", label: "波", draw: patternWaves },
  { id: "flakes", label: "フレーク", draw: patternFlakes },
];

// 既定は淡い紫の無地。以前の既定の下地と同じ見え方にそろえてある
const DEFAULT_SHARE_COLOR = "purple";
const DEFAULT_SHARE_PATTERN = "gradient";

function shareColorById(id) {
  return SHARE_TEMPLATE_COLORS.find((color) => color.id === id) || null;
}

function sharePatternById(id) {
  return SHARE_TEMPLATE_PATTERNS.find((pattern) => pattern.id === id) || null;
}

// 色と模様の組み合わせから下地を作る。知らないidは既定へ落とす
// (下地が無い状態を作ると、背景の描き分けが1つ増えるだけで得が無い)
function shareTemplate(colorId, patternId) {
  const color = shareColorById(colorId) || shareColorById(DEFAULT_SHARE_COLOR);
  const pattern = sharePatternById(patternId) || sharePatternById(DEFAULT_SHARE_PATTERN);
  const palette = templatePalette(color.hue);
  return {
    id: `${color.id}-${pattern.id}`,
    color,
    pattern,
    label: `${color.label}の${pattern.label}`,
    theme: "light",
    // step を省くと canvas の大きさから決める。見本だけ詰めた値を渡す
    draw: (ctx, w, h, step) => {
      fillLinearGradient(ctx, w, h, palette.from, palette.to);
      if (!pattern.draw) return;
      ctx.save();
      ctx.fillStyle = palette.ink;
      ctx.strokeStyle = palette.ink;
      pattern.draw(ctx, w, h, step || patternStep(w, h));
      ctx.restore();
    },
  };
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
  const used = template || shareTemplate(DEFAULT_SHARE_COLOR, DEFAULT_SHARE_PATTERN);
  used.draw(ctx, width, height);
  return used.theme;
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

      // 金額を先に測り、名前が入れる幅を残す。**測るときも描くときと同じ字体にする**
      // (細い字で測ると、太くした分だけ名前に重なる)
      ctx.font = `600 ${layout.listValue}px ${SHARE_CARD_FONT}`;
      const valueWidth = row.value ? ctx.measureText(row.value).width : 0;
      ctx.fillStyle = theme.fg;
      ctx.font = `bold ${layout.listName}px ${SHARE_CARD_FONT}`;
      ctx.fillText(fitText(ctx, row.name, right - left - 56 - valueWidth - 32), left + 56, y);

      if (row.value) {
        ctx.fillStyle = theme.value;
        ctx.font = `600 ${layout.listValue}px ${SHARE_CARD_FONT}`;
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
