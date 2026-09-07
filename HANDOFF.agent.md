# Agent handoff v1

updated: 2026-09-07
repo: Kie610/booth_purchase_total_extension
work_branch: 1.2.0
upstream: origin/1.2.0@5b74920
base: 1.1.0@67f206d
goal: 1.2.0はリリース済み。BOOTH商品ページとNotionの更新、次版1.3.0の準備。

## State

complete:
- C: 先行レビュー13件に加えDATA-04・UX-01・02・05・AVATAR-01を修正。EFF-01は次版。
- C: docs/reviews/2026-09-07/evidence を修正後の期待値へ更新。
- C: 1.2.0を正式リリース。ブランチ1.2.0へリネーム、main・origin/main・1.2.0・origin/1.2.0はすべて5b74920。注釈付きタグv1.2.0(タグオブジェクト29030ff)。GitHub Release v1.2.0にZIPとSHA-256を添付。origin/1.2.0-devは削除。
- C: 配布ZIPはtools/release.ps1で7487a2c以降のコードから再生成。26ファイル、version 1.2.0、SHA256=253b00a0ee5acf0b81b16e8d9a34ad1422f09a3654e45cc7fc0fee2946e1b935。
- C: BOOTH商品ページ用の画像2点を販売ページ準備/1.2.0画像/へ生成(10_gifts.png・06_data_move_v1.2.0.png)。2048x2048、架空データのためぼかし不要。撮影スクリプトはリポジトリ外の一時領域にあり保存していない。
- C: Notionの商品ページ仮案を1.2.0へ更新。親ページ(改題・決定事項・未決事項)、00 索引・決定事項、01 商品概要、02 BOOTH本文案。03・05・06は画像の採否が決まっていないため未更新。
- U: BOOTH商品ページ自体は未編集。manage.booth.pm/items/8667966/edit での差し替えは未実施。

verified:
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-check.cjs; environment=Windows/Node24; scope=移行・往復; counts=passed=37, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-browser-check.cjs (NODE_PATH=既存Playwright); environment=Chrome/合成storage; scope=保存失敗・復旧・2タブ・出力UI; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright で test/index.html; environment=Chrome/1280px; scope=test/cases.js; counts=passed=1151, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js test/*.cjs; environment=Node24; scope=全JS構文; counts=passed=19, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node .local/review-ux/browser.cjs --screens-only; environment=Chrome/合成; scope=8画面例外0・外部要求0; counts=passed=8, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node docs/reviews/2026-09-07/evidence/{adversarial,maintenance,security}.cjs; environment=Node24; scope=adversarial7・maintenance5・security11; counts=passed=23, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright getComputedStyle; environment=Chrome light/dark; scope=主ボタン・選択中の白文字/塗り4.98:1; counts=passed=4, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=hardware; command=実BOOTHでの手動確認(U7); environment=実ブラウザ; scope=ページング・明細・受取権限・外部通信0(ユーザー報告); counts=passed=5, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=hardware; command=修正版を実拡張で表示(AVATAR-01); environment=実ブラウザ/実購入履歴; scope=沼レポートの「ヴェルノ」表記が正しいこと(ユーザー報告); counts=passed=1, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=compile; command=tools/release.ps1 -Force; environment=PowerShell7; scope=ZIP26ファイル/version1.2.0/SHA256同梱; counts=passed=1, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=gh release download v1.2.0 後にSHA-256照合; environment=GitHub; scope=公開資産とローカル成果物と同梱.sha256の三者一致; counts=passed=3, failed=0, skipped=0, not-run=0

not-run:
- U: U1 DATA-04・UX-01・UX-05の実BOOTH実データでの確認。AVATAR-01は確認済み。
- U: U2 実拡張でのテーマ確認。hover色は計算値のみ。
- U: U8 Excel再保存CSV往復。

## Decisions

- C: DATA-04 1.2.0。索引無し経路もキャンセル除外(状態不明は残す)。
- C: UX-01 1.2.0。ギフト画面見出しは印なし、フッターに範囲の印。
- C: UX-02 1.2.0。白文字の塗りだけ--accent-solid。ブランド色は据え置き。
- C: UX-05 1.2.0。比較年が無ければ選択欄を無効にし記録なしを明示。
- C: EFF-01 1.3.0。描画分割は共有状態・フッターを跨ぐ構造変更のため。
- C: AVATAR-01 1.2.0。原因はキー(ひらがな化)の直接表示。表示名だけ題名の綴りへ。キー不変。実拡張で修正を確認済みのためU3は解消。
- C: 再取得で移行を代替しない。正式対応はChrome。共有カード幅チェックは768px以上。

## Next

1. BOOTH商品ページを実際に編集して下書き保存する(画像の採否・掲載順、商品名末尾の日付表記、ZIP差し替え) — blocked-by: ユーザーの判断
2. Notionの03・05・06(画像順・公開前チェック・サムネイル)を1.2.0へ更新 — blocked-by: 1の画像採否
3. EFF-01を1.3.0で実施 — blocked-by: none
4. 年1回のmirror更新と復元確認(2027-09まで) — blocked-by: none

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
