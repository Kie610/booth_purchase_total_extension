# Agent handoff v1

updated: 2026-09-05
repo: Kie610/booth_purchase_total_extension
work_branch: 1.2.0-dev
upstream: origin/1.2.0-dev@bff7836
base: 1.1.0@67f206d
goal: `1.2.0-dev`で1.2.0(ギフト受取状況の画面と注文内訳の移設)を仕上げ、実環境確認を経てリリースする。

## State

complete:
- C: v1.0.0・v1.1.0を正式リリース済み。`main`・`1.1.0`・タグ`v1.1.0`は同一SHA 67f206d。
- C: `1.1.0`へP1〜P12を統合済み。内訳は docs/improvement-plan.md。
- C: 運用ルール合成を08-08・08-16・09-05に実施。採否と手順版は docs/handoff-history.md の Migration record。
- C: 2026-09-05 1.2.0 の実装を完了(仕様: docs/superpowers/specs/2026-09-05-gift-status-view-design.md)。
  「ギフト・注文」画面(#/gifts)を追加し、贈ったギフトの受取状況(booth.pm/gifts/<UUID>/edit)を
  2ボタン(URL取り直し / 受取状況の確認)で取得。「注文ごとの内訳」をレポートからこの画面へ移設。
  CACHE_SCHEMA_VERSION=2(取り直し対象はギフトを含む v1 注文のみ)。新キー boothGiftStatus。
  optional_host_permissions に https://booth.pm/*。manifest version 1.2.0。

verified:
- C: 2026-09-05(1.2.0実装後) — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js; environment=Windows 11 / Node.js 24.18.1; scope=extension/とtest/の全JavaScript構文; counts=passed=17, failed=0, skipped=0, not-run=0
- C: 2026-09-05(1.2.0実装後) — evidence: status=PASS; kind=runtime; command=python -m http.server 8731 と http://localhost:8731/test/index.html を幅1280pxで開く; environment=Windows 11 / Chromium 1280x900; scope=test/cases.js全体 ALL PASS; counts=passed=1110, failed=0, skipped=0, not-run=0
- C: 2026-09-05 — evidence: status=PASS; kind=runtime; command=stub差し込みの dashboard.html 複製を幅1280pxで表示; environment=Windows 11 / Chromium; scope=水平タブ8項目が1行に収まる・ヘッダー右の「作者について」表示・#/gifts の表と2ボタンの描画; counts=passed=1, failed=0, skipped=0, not-run=0
- C: 2026-09-05 — evidence: status=PASS; kind=external; command=ログイン済みChromeで accounts.booth.pm/orders/87212632・82903405 と booth.pm/gifts/<UUID>/edit を読み取り; environment=Windows 11 / Chrome; scope=ギフトリンクのhref形式・「状態」「受取日時」「発行日時」のラベル構造(未受取1件・受取済み6件); counts=passed=7, failed=0, skipped=0, not-run=0
- C: 2026-09-05 — evidence: status=PASS; kind=compile; command=git clone -b 1.2.0-dev ../backup/booth_purchase_total_extension-2026-09-05.git と tools/release.ps1; environment=Windows 11 / PowerShell 7; scope=復元cloneで配布ZIPとSHA-256を生成; counts=passed=1, failed=0, skipped=0, not-run=0

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認。D10のみ2026-08-07にユーザー実環境で確認済み。ギフト関連セレクタは2026-09-05に実測済み(上記)。
- U: U7 実拡張として読み込んだChromeでの1.2.0動作確認(ギフトURLの取り直し・受取状況の確認・optional権限のプロンプト・表示)。テストとstub複製での確認のみ。
- U: U8 1.2.0 の `tools/release.ps1`(配布ZIP)未実行。
- U: U2 実拡張として読み込んだブラウザでのD11テーマ・D14/D17沼レポート。プレビュー複製での確認のみ。
- U: U4 2026-09-05の `tools/release.ps1`。文書と.gitignoreのみの変更で配布物に差分が無いため未実行。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへff同期する。`main`廃止の提唱は不採用(2026-08-16)。
- C: versionと同名のブランチを作り、削除せず残す。大きな機能追加はマイナー、修正や小さな変更はパッチ番号。
- C: 共有カードの幅依存テスト1件は幅521pxで落ちる。検証は幅768px以上で。
- C: 正式対応はChromeのみ。Firefoxは一時読み込みに限定(2026-08-09)。
- A: D14の伏せ字共有でもアバター名は出す。利用者からの指摘の有無で検証する。
- C: U3解消(2026-09-05): 次版は1.2.0(ギフト受取状況の画面)。`manifest.json`を1.2.0へ上げた。テストの固定版数も1.2.0。README/appendixの「正式リリースは1.1.0」はリリースまで据え置く。
- C: 受取状況(booth.pm)の取得は「ギフト・注文」画面のボタンからのみ。通常の収集では booth.pm へアクセスしない(2026-09-05ユーザー決定)。(a)URL取り直しと(b)受取状況確認は別ボタン(同上)。
- C: 開発中の統合ブランチは`<次版>-dev`、リリース時に承認を得て`<version>`へリネーム(2026-09-05ユーザー決定。U5解消)。
- C: バックアップ保存先は`D:\GitHub_WorkSpace\BrowserExtensionackup\`(2026-09-05ユーザー指定。U6解消)。
- C: 初回mirror取得と復元確認済み(2026-09-05、U6解消)。

## Next

1. 実拡張として読み込んで1.2.0を実環境確認する(U7)。問題なければ `tools/release.ps1` で配布物を作り(U8)、docs/versioning.md の手順でリリース — blocked-by: U7
2. 年1回(2027-09まで)のmirror更新と復元確認 — blocked-by: none

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion(版の正本)
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 毎回有効な永続ルール
- C: `docs/agent-appendix.md` — 場面限定ルール(委任・リリース・バックアップ)
- C: `docs/versioning.md` — リリースとmain同期の手順
- C: `docs/handoff-history.md` — 旧HANDOFF原文・合成の採否・Migration record
- C: `docs/improvement-plan.md` — 2026-08-07レビューの指摘と委任プロンプト
- C: `docs/superpowers/specs/2026-09-05-gift-status-view-design.md` — 1.2.0 の仕様(実測したBOOTHの構造を含む)

## Resume protocol

1. Read `AGENTS.md` and this file.
2. Verify live Git/external state; live evidence overrides recorded metadata.
3. Read only paths needed for the first unblocked action.
4. Run the smallest relevant baseline checks.
5. Execute the highest-priority unblocked action.
6. Update evidence; never convert `not-run` to PASS without execution.
