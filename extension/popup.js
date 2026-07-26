"use strict";

// ポップアップは「概要の表示」と「集計ページへの導線」だけを担当し、
// 実際の取得処理は dashboard.html 側で動かす(ポップアップは閉じると破棄されるため)

const openBtn = document.getElementById("openBtn");
const runningBox = document.getElementById("runningBox");
const runningText = document.getElementById("runningText");
const progressFill = document.getElementById("progressFill");
const summaryBox = document.getElementById("summaryBox");
const summaryLabel = document.getElementById("summaryLabel");
const totalAmountEl = document.getElementById("totalAmount");
const totalCountEl = document.getElementById("totalCount");
const updatedAtEl = document.getElementById("updatedAt");
const emptyBox = document.getElementById("emptyBox");

openBtn.addEventListener("click", async () => {
  await openDashboard();
  window.close();
});

ext.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[RUN_STATE_KEY] || changes[SUMMARY_KEY]) {
    render();
  }
});

render();

async function render() {
  const [runState, summary] = await Promise.all([loadRunState(), loadSummary()]);

  if (runState) {
    const { phase, current, total } = runState;
    runningText.textContent =
      total > 0 ? `${phase} (${current}/${total})` : `${phase}...`;
    progressFill.style.width =
      total > 0 ? `${Math.min(100, (current / total) * 100)}%` : "0%";
    runningBox.hidden = false;
    openBtn.textContent = "集計ページを表示";
  } else {
    runningBox.hidden = true;
    openBtn.textContent = "集計ページを開く";
  }

  if (summary) {
    summaryLabel.textContent = summary.partial
      ? "収集済みの合計(中断時点)"
      : "収集済みの合計";
    totalAmountEl.textContent = formatYen(summary.total);
    totalCountEl.textContent =
      `収集済み: ${summary.count}件` +
      (summary.pendingCount ? ` / 未収集: ${summary.pendingCount}件` : "") +
      (summary.skippedCancelled
        ? ` / 除外(キャンセル): ${summary.skippedCancelled}件`
        : "");
    updatedAtEl.textContent = `最終更新: ${formatTimestamp(summary.updatedAt)}`;
    summaryBox.hidden = false;
    emptyBox.hidden = true;
  } else {
    summaryBox.hidden = true;
    emptyBox.hidden = Boolean(runState);
  }
}
