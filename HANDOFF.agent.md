# Agent handoff v1

updated: 2026-09-05
repo: Kie610/booth_purchase_total_extension
work_branch: 1.2.0-dev
upstream: origin/1.2.0-dev@bc3908d(ローカルが先行、未push)
base: 1.1.0@67f206d
goal: `1.2.0-dev`で次版の要件確定と実装を進める。

## State

complete:
- C: v1.0.0・v1.1.0を正式リリース済み。`main`・`1.1.0`・タグ`v1.1.0`は同一SHA 67f206d。
- C: `1.1.0`へP1〜P12を検品のうえ統合済み。内訳は docs/improvement-plan.md。
- C: 運用ルール合成を08-08・08-16・09-05に実施。採否と手順版は docs/handoff-history.md の Migration record。

verified:
- C: 2026-09-05 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js; environment=Windows 11 / Node.js 24.18.1; scope=extension/とtest/の全JavaScript構文; counts=passed=17, failed=0, skipped=0, not-run=0
- C: 2026-09-05 — evidence: status=PASS; kind=runtime; command=python -m http.server 8731 と http://127.0.0.1:8731/test/index.html を幅1280pxで開く; environment=Windows 11 / Chromium 1280x900; scope=test/cases.js全体 ALL PASS; counts=passed=1055, failed=0, skipped=0, not-run=0

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認。D10のみ2026-08-07にユーザー実環境で確認済み。
- U: U2 実拡張として読み込んだブラウザでのD11テーマ切り替え・D14/D17沼レポート。プレビュー複製での確認のみ。
- U: U4 2026-09-05の `tools/release.ps1`。文書と.gitignoreのみの変更で配布物に差分が無いため未実行。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへff同期する。`main`廃止の提唱は不採用(2026-08-16)。
- C: versionと同名のブランチを作り、削除せず残す。大きな機能追加はマイナー、修正や小さな変更はパッチ番号。
- C: 共有カードの幅依存テスト1件は幅521pxで落ちる。検証は幅768px以上で行う。
- C: 正式対応はChromeのみ。Firefoxは一時読み込みに限定(2026-08-09)。
- A: D14の伏せ字共有でもアバター名は出す。利用者からの指摘の有無で検証する。
- U: U3 次版(1.2.0または1.1.1)の要件が未確定。`manifest.json`は1.1.0のまま。
- U: U5 作業ブランチ名`1.2.0-dev`は「ブランチ名=manifestのversion」の規則と一致しない。次版確定時に改名か規則更新かを決める。
- U: U6 バックアップ保存先(別ドライブ)が未決定。mirror未取得、復元未検証。
- U: U7 `.claude/worktrees/`配下の9 worktreeは移動前のパスを指しprunable。所有者確認までpruneしない。
- U: U8 pushのユーザー許可が未取得。

## Next

1. 本合成のコミットと未push分を`origin/1.2.0-dev`へpushする — blocked-by: U8
2. 次版の要件を確定し`manifest.json`・README・ブランチ名をそろえる — blocked-by: U3
3. バックアップ保存先を決めて初回mirrorと復元確認を行う — blocked-by: U6

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion(版の正本)
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 毎回有効な永続ルール
- C: `docs/agent-appendix.md` — 委任・並行実装・リリース・バックアップの場面限定ルール
- C: `docs/versioning.md` — バージョン決定、正式リリース、main同期の手順
- C: `docs/handoff-history.md` — 旧HANDOFF原文・合成の採否・Migration record
- C: `docs/improvement-plan.md` — 2026-08-07レビューの指摘と委任プロンプト

## Resume protocol

1. Read `AGENTS.md` and this file.
2. Verify live Git/external state; live evidence overrides recorded metadata.
3. Read only paths needed for the first unblocked action.
4. Run the smallest relevant baseline checks.
5. Execute the highest-priority unblocked action.
6. Update evidence; never convert `not-run` to PASS without execution.
