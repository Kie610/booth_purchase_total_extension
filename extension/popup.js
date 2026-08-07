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
const summaryYearBox = document.getElementById("summaryYearBox");
const summaryYearLabel = document.getElementById("summaryYearLabel");
const summaryYearTotal = document.getElementById("summaryYearTotal");
const summaryYearCount = document.getElementById("summaryYearCount");
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
    const ratio = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${Math.min(100, Math.max(0, ratio))}%`;
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
    const counts = summaryCounts(summary);
    totalCountEl.textContent = counts.text;
    // 取得失敗は色を分けるので、同じ行の中で別の要素にして添える
    if (counts.failed) {
      const failed = document.createElement("span");
      failed.className = "failed";
      failed.textContent = counts.failed;
      totalCountEl.appendChild(failed);
    }
    // 古い要約(今年の項目を持たないもの)でも壊れないよう、無ければ行ごと隠す
    const yearLine = summaryYearLine(summary);
    summaryYearBox.hidden = !yearLine;
    if (yearLine) {
      summaryYearLabel.textContent = yearLine.label;
      summaryYearTotal.textContent = yearLine.value;
      summaryYearCount.textContent = yearLine.count;
    }
    updatedAtEl.textContent = `最終更新: ${formatTimestamp(summary.updatedAt)}`;
    summaryBox.hidden = false;
    emptyBox.hidden = true;
  } else {
    summaryBox.hidden = true;
    emptyBox.hidden = Boolean(runState);
  }
}
