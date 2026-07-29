"use strict";

// 作者情報ダイアログの表示とフォーカス管理。
// DOM参照とドロワー制御は dashboard-view.js が提供する。

let authorReturnFocus = null;

function authorModalBackgroundElements() {
  return Array.from(document.body.children).filter(
    (element) => element !== authorOverlay && element !== authorPanel && element.tagName !== "SCRIPT"
  );
}

function setAuthorModalBackgroundInert(inert) {
  for (const element of authorModalBackgroundElements()) element.inert = inert;
  document.body.classList.toggle("modal-open", inert);
}

function authorPanelFocusableElements() {
  return Array.from(authorPanel.querySelectorAll('button:not([disabled]), a[href]')).filter(
    (element) => element.getClientRects().length > 0 || document.body.dataset.noAutoInit !== undefined
  );
}

function trapAuthorPanelFocus(event) {
  if (event.key !== "Tab" || authorPanel.hidden) return;
  const focusable = authorPanelFocusableElements();
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openAuthorPanel() {
  authorReturnFocus = menuBtn;
  setDrawerOpen(false, false);
  authorOverlay.hidden = false;
  authorPanel.hidden = false;
  setAuthorModalBackgroundInert(true);
  authorCloseBtn.focus();
}

function closeAuthorPanel() {
  if (authorPanel.hidden) return;
  authorOverlay.hidden = true;
  authorPanel.hidden = true;
  setAuthorModalBackgroundInert(false);
  if (authorReturnFocus) authorReturnFocus.focus();
  authorReturnFocus = null;
}
