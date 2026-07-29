"use strict";

// 画面ごとの共有内容と、共有カード作成ダイアログの表示。
// 文面・canvas描画の純粋処理は share.js が担当する。

// ---- 共有 --------------------------------------------------------------

// 描画に使った並びをそのまま持ち回る。共有のときに集計し直すと、
// 画面に出ている順位と違うものを外に出しかねない
function buildRankingShareStats(results, shops) {
  return {
    sort: rankingSort,
    rows: shops.slice(0, RANKING_SHARE_LIMIT),
    shopCount: shops.length,
    // 順位が実際とずれる原因。共有の前に断るために持っておく
    pending: results.filter((r) => needsCollect(state.cache[r.id])).length,
    unknown: shops.reduce((sum, row) => sum + row.unknown, 0),
    indexComplete: indexIsComplete(state.index),
  };
}

// フッターの共有ボタンは開いている画面によって共有するものが変わる。
// ボタンの文言も変えないと、何が投稿されるのか押すまで分からない
function shareMode() {
  const view = viewFromHash(location.hash);
  return view === "ranking" || view === "summary" ? view : "total";
}

function updateShareButton() {
  // パネルが開いている間は押しても何も起きない。押せる見た目のまま反応しないと
  // 壊れているように見えるので、閉じるまで無効にする
  if (!sharePanel.hidden) {
    shareBtn.disabled = true;
    return;
  }
  const mode = shareMode();
  if (mode === "ranking") {
    shareBtn.textContent = "𝕏でランキングを共有";
    shareBtn.disabled = !rankingShareStats || rankingShareStats.rows.length === 0;
    return;
  }
  if (mode === "summary") {
    // 何年のまとめが出るのかは、押す前に分かる必要がある
    shareBtn.textContent = summaryShareStats
      ? `𝕏で${summaryShareStats.year}年のまとめを共有`
      : "𝕏でまとめを共有";
    shareBtn.disabled = !summaryShareStats || summaryShareStats.orderCount === 0;
    return;
  }
  shareBtn.textContent = "𝕏で共有";
  // 今年分に未収集があるなら、押したあとに収集してから共有できる
  shareBtn.disabled =
    !shareStats || (shareStats.count === 0 && shareStats.yearPendingCount === 0);
}

// ---- 共有カードのパネル ------------------------------------------------
//
// 𝕏の投稿画面(intent)には画像を添付できない。URLで渡せるのは文面だけなので、
// 画像はここで作って保存かコピーをしてもらい、投稿画面へ本人に貼ってもらう。

// 押した時点の中身。背景を差し替えても同じ数字で描き直せるよう持っておく
let sharePayload = null;
// 選ばれた背景画像。タブの中だけで持ち、保存も送信もしない
let shareBackground = null;
let shareBackgroundTransform = { scale: 1, x: 0, y: 0 };

// 選んでいる縦横比
let shareRatio = DEFAULT_SHARE_RATIO;
let shareReturnFocus = null;

function shareModalBackgroundElements() {
  return Array.from(document.body.children).filter(
    (element) => element !== shareOverlay && element !== sharePanel && element.tagName !== "SCRIPT"
  );
}

function setShareModalBackgroundInert(inert) {
  for (const element of shareModalBackgroundElements()) element.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function sharePanelFocusableElements() {
  return Array.from(
    sharePanel.querySelectorAll(
      'button:not([disabled]):not([hidden]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
    )
  ).filter((element) => element.getClientRects().length > 0 || document.body.dataset.noAutoInit !== undefined);
}

function trapSharePanelFocus(event) {
  if (event.key !== "Tab" || sharePanel.hidden) return;
  const focusable = sharePanelFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    sharePanel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSharePanel(payload) {
  shareReturnFocus = document.activeElement;
  sharePayload = payload;
  shareText.value = payload.text;
  setShareCardStatus("");
  shareOverlay.hidden = false;
  sharePanel.hidden = false;
  setShareModalBackgroundInert(true);
  renderShareRatioToggle();
  renderShareBackgroundControls();
  renderShareTemplates();
  drawSharePanelCard();
  // パネルを開いている間は、後ろの共有ボタンを押せないようにする
  updateShareButton();
  shareCloseBtn.focus();
}

function closeSharePanel() {
  if (sharePanel.hidden) return;
  shareOverlay.hidden = true;
  sharePanel.hidden = true;
  setShareModalBackgroundInert(false);
  sharePayload = null;
  setShareCardStatus("");
  updateShareButton();
  if (shareReturnFocus && typeof shareReturnFocus.focus === "function") {
    shareReturnFocus.focus();
  }
  shareReturnFocus = null;
}

function setShareRatio(ratio) {
  if (!SHARE_RATIOS[ratio] || ratio === shareRatio) return;
  shareRatio = ratio;
  renderShareRatioToggle();
  drawSharePanelCard();
}

function renderShareBackgroundControls() {
  const active = Boolean(shareBackground);
  const percent = Math.round(shareBackgroundTransform.scale * 100);
  shareScaleInput.disabled = !active;
  shareScaleInput.value = String(percent);
  shareScaleValue.textContent = `${percent}%`;
  shareCanvas.classList.toggle("adjustable", active);
  shareCanvas.setAttribute("aria-disabled", String(!active));
  shareCanvas.tabIndex = active ? 0 : -1;
}

function setShareBackgroundScale(percent) {
  if (!shareBackground) return;
  const next = Math.max(100, Math.min(300, Number(percent) || 100)) / 100;
  if (next === shareBackgroundTransform.scale) return;
  shareBackgroundTransform.scale = next;
  renderShareBackgroundControls();
  drawSharePanelCard();
}

function moveShareBackground(deltaX, deltaY) {
  if (!shareBackground) return;
  shareBackgroundTransform.x = Math.max(-1, Math.min(1, shareBackgroundTransform.x + deltaX));
  shareBackgroundTransform.y = Math.max(-1, Math.min(1, shareBackgroundTransform.y + deltaY));
  drawSharePanelCard();
}

function renderShareRatioToggle() {
  shareRatioToggle.querySelectorAll(".segmented-btn").forEach((btn) => {
    const on = btn.dataset.ratio === shareRatio;
    btn.classList.toggle("current", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function drawSharePanelCard() {
  if (!sharePayload) return;
  const { width, height } = SHARE_RATIOS[shareRatio];
  // canvasは大きさを変えると中身が消えるので、変わったときだけ入れ替える
  if (shareCanvas.width !== width || shareCanvas.height !== height) {
    shareCanvas.width = width;
    shareCanvas.height = height;
  }
  const ctx = shareCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  drawShareCard(
    ctx,
    sharePayload.card,
    shareBackground,
    currentShareTemplate(),
    shareBackgroundTransform
  );
}

function setShareBackground(image, name) {
  if (shareBackground && shareBackground !== image && typeof shareBackground.close === "function") {
    shareBackground.close();
  }
  shareBackground = image;
  shareBackgroundTransform = { scale: 1, x: 0, y: 0 };
  shareBgName.textContent = image ? name : "未選択（テンプレートを使います）";
  shareBgClearBtn.hidden = !image;
  renderShareBackgroundControls();
  renderShareTemplates();
  drawSharePanelCard();
}

// ---- 背景のテンプレート ------------------------------------------------
//
// 色と模様を別々に選び、その組み合わせが背景になる。どちらも必ず1つ選ばれて
// いる状態にする(「選択なし」を作ると、下地の見た目がもう1種類増えるだけ)。

let shareColor = DEFAULT_SHARE_COLOR;
let sharePattern = DEFAULT_SHARE_PATTERN;

function currentShareTemplate() {
  return shareTemplate(shareColor, sharePattern);
}

function setShareColor(id) {
  if (!shareColorById(id) || id === shareColor) return;
  shareColor = id;
  renderShareTemplates();
  drawSharePanelCard();
}

function setSharePattern(id) {
  if (!sharePatternById(id) || id === sharePattern) return;
  sharePattern = id;
  renderShareTemplates();
  drawSharePanelCard();
}

// 見本は実際の描画関数で小さく描く。見本だけ別に持つと、実物と食い違っても
// 気付けない。ただし**間隔だけは詰める**(実寸と同じ間隔だと模様が1つ2つしか
// 入らず、何の模様なのか見て分からない)。
// 色の見本には選んでいる模様を、模様の見本には選んでいる色を乗せる。
// 組み合わせた結果がそのまま見えるので、選ぶ前に確かめられる
function renderShareTemplateRow(container, items, selectedId, buildTemplate) {
  container.textContent = "";
  for (const item of items) {
    const template = buildTemplate(item);
    const button = el("button", "share-template");
    button.type = "button";
    button.dataset.templateId = item.id;
    button.title = template.label;
    button.setAttribute("aria-label", template.label);
    button.setAttribute("aria-pressed", String(item.id === selectedId));
    if (item.id === selectedId) button.classList.add("current");

    const preview = document.createElement("canvas");
    preview.width = 96;
    preview.height = 54;
    template.draw(preview.getContext("2d"), preview.width, preview.height, SHARE_PREVIEW_STEP);
    button.appendChild(preview);
    container.appendChild(button);
  }
}

function renderShareTemplates() {
  renderShareTemplateRow(shareColors, SHARE_TEMPLATE_COLORS, shareColor, (color) =>
    shareTemplate(color.id, sharePattern)
  );
  renderShareTemplateRow(sharePatterns, SHARE_TEMPLATE_PATTERNS, sharePattern, (pattern) =>
    shareTemplate(shareColor, pattern.id)
  );
  // 画像を選んでいる間はテンプレートが効かないので、そのことを見た目でも示す
  for (const row of [shareColors, sharePatterns]) {
    row.classList.toggle("disabled", Boolean(shareBackground));
  }
}

// 状態表示は用が済んだら消す。前回の「保存しました」が残っていると、
// いま押した操作の結果と見分けが付かない
let shareCardStatusTimer = null;
const SHARE_STATUS_MS = 5000;

function setShareCardStatus(text) {
  shareCardStatus.textContent = text;
  clearTimeout(shareCardStatusTimer);
  if (text) {
    shareCardStatusTimer = setTimeout(() => {
      shareCardStatus.textContent = "";
    }, SHARE_STATUS_MS);
  }
}

// 押し直してもらうボタンの文言。パネルが開いていればパネル側のボタン、
// 閉じていればフッターのボタンを指す
function shareRetryLabel() {
  return sharePanel.hidden ? shareBtn.textContent : shareOpenBtn.textContent;
}

function shareCardFileName() {
  return `${sharePayload ? sharePayload.name : "share"}.png`;
}
