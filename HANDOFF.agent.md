# Agent handoff v1

updated: 2026-09-07
repo: Kie610/booth_purchase_total_extension
work_branch: 1.2.0-dev
upstream: origin/1.2.0-dev
base: 1.1.0@67f206d
goal: 1.2.0を確定し、承認後にリリースする。

## State

complete:
- C: 先行レビュー13件に加えDATA-04・UX-01・02・05・AVATAR-01を修正。EFF-01は次版。
- C: docs/reviews/2026-09-07/evidence を修正後の期待値へ更新。

verified:
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-check.cjs; environment=Windows/Node24; scope=移行・往復; counts=passed=37, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-browser-check.cjs (NODE_PATH=既存Playwright); environment=Chrome/合成storage; scope=保存失敗・復旧・2タブ・出力UI; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright で test/index.html; environment=Chrome/1280px; scope=test/cases.js; counts=passed=1151, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js test/*.cjs; environment=Node24; scope=全JS構文; counts=passed=19, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node .local/review-ux/browser.cjs --screens-only; environment=Chrome/合成; scope=8画面例外0・外部要求0; counts=passed=8, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node docs/reviews/2026-09-07/evidence/{adversarial,maintenance,security}.cjs; environment=Node24; scope=adversarial7・maintenance5・security11; counts=passed=23, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright getComputedStyle; environment=Chrome light/dark; scope=主ボタン・選択中の白文字/塗り4.98:1; counts=passed=4, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=hardware; command=実BOOTHでの手動確認(U7); environment=実ブラウザ; scope=ページング・明細・受取権限・外部通信0(ユーザー報告); counts=passed=5, failed=0, skipped=0, not-run=0

not-run:
- U: U1 修正5件の実BOOTH実データでの確認。
- U: U2 実拡張でのテーマ確認。hover色は計算値のみ。
- U: U3 AVATAR-01の実データ再現。「ヴェルノ」「ライカ」の商品名文字列が未取得。
- U: U8 Excel再保存CSV往復。

## Decisions

- C: DATA-04 1.2.0。索引無し経路もキャンセル除外(状態不明は残す)。
- C: UX-01 1.2.0。ギフト画面見出しは印なし、フッターに範囲の印。
- C: UX-02 1.2.0。白文字の塗りだけ--accent-solid。ブランド色は据え置き。
- C: UX-05 1.2.0。比較年が無ければ選択欄を無効にし記録なしを明示。
- C: EFF-01 1.3.0。描画分割は共有状態・フッターを跨ぐ構造変更のため。
- C: AVATAR-01 1.2.0。原因はキー(ひらがな化)の直接表示。表示名だけ題名の綴りへ。キー不変。
- C: 再取得で移行を代替しない。正式対応はChrome。共有カード幅チェックは768px以上。

## Next

1. 1.2.0を報告し、U3の商品名文字列と承認を得る — blocked-by: U3
2. docs/versioning.md の手順でリリース — blocked-by: U1
3. EFF-01を1.3.0で実施 — blocked-by: none

## Paths

- C: docs/reviews/2026-09-07/README.md — レビュー資料
- C: docs/handoff-history.md — 過去の状態・検証・判断の原文
- C: docs/versioning.md — リリース手順
- C: extension/manifest.json — 版の正本

## Resume protocol

1. Read AGENTS.md and this file.
2. Verify live Git/external state; live evidence overrides recorded metadata.
3. Read only paths needed for the first unblocked action.
4. Run the smallest relevant baseline checks.
5. Execute the highest-priority unblocked action.
6. Update evidence; never convert not-run to PASS without execution.
