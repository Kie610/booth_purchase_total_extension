# Agent handoff v1

updated: 2026-08-16
repo: Kie610/booth_purchase_total_extension
work_branch: 1.1.0
upstream: origin/1.1.0@67f206d861f6bbaf633209d00db254526d152d37
base: 1.0.0@cc090b9ddbd42753522e4c050f939d43ee0a8713
goal: v1.1.0を正式リリースする(2026-08-10にユーザー指示で実施)。

## State

complete:
- C: v1.0.0を正式リリース済み(GitHub Release公開、`main`を同じSHAへff同期済み)。
- C: `1.1.0`へP1〜P12(A1〜A5・B1〜B4・C1〜C18・D1〜D22・T1)を検品のうえ統合済み。内訳と設計判断は docs/improvement-plan.md と docs/handoff-history.md。
- C: 運用ルール合成を2026-08-08と2026-08-16に実施。AGENTS.mdをひな形の必須節へそろえ、場面限定ルールを docs/agent-appendix.md へ分離(6文書構成)。採否は docs/handoff-history.md。

verified:
- C: 2026-08-10 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js; environment=Windows 11 / Node.js; scope=extension/とtest/の全JavaScript構文; counts=passed=17, failed=0, skipped=0, not-run=0
- C: 2026-08-10 — evidence: status=PASS; kind=runtime; command=python -m http.server 8847 と /test/index.html を幅1280pxで開く; environment=Windows 11 / Chromium系ブラウザ 1280x900; scope=test/cases.js全体 ALL PASS; counts=passed=1055, failed=0, skipped=0, not-run=0
- C: 2026-08-10 — evidence: status=PASS; kind=compile; command=python hashlib と zipfile で dist/*.zip を照合; environment=Windows 11 / Python; scope=dist/booth-purchase-total-extension-v1.1.0.zip の26 entriesと.sha256(2d7426ff...c3ddd0)の一致; counts=passed=1, failed=0, skipped=0, not-run=0

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認。D10のステータス再取得のみ2026-08-07にユーザー実環境で確認済み。
- U: U2 実拡張として読み込んだブラウザでのD11テーマ切り替え・D14/D17沼レポート(実際のext.storage.local)。プレビュー複製での確認のみ済み。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへff同期する。
- C: versionと同名のブランチを作り、削除せず残す。
- C: 大きな機能追加はマイナー、バグ修正や小さな機能変更はパッチ番号を更新する。
- C: 共有カードの幅依存テスト1件は幅521pxで落ちる。検証は幅768px以上で行う。
- C: 正式対応はChromeのみ。Firefoxは一時読み込みに限定し署名・AMO対応は不採用(2026-08-09)。
- A: D14の伏せ字共有でもアバター名は出す(素体名は広く共有された呼び名で個人特定性が低い)。利用者からの指摘の有無で検証する。
- U: U3 次版(1.2.0または1.1.1)の要件が未確定。

## Next

1. v1.1.0正式リリースの完了確認(main同期・タグ・Release資産の再取得検証) — blocked-by: none
2. 次版は同期した`main`から`1.2.0`(または`1.1.1`)ブランチを作る — blocked-by: U3

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 毎回有効な永続ルール
- C: `docs/agent-appendix.md` — 委任・並行実装・リリース・引き継ぎ整備の場面限定ルール
- C: `docs/versioning.md` — バージョン決定、正式リリース、main同期の詳細手順
- C: `docs/handoff-history.md` — 旧HANDOFFの詳細手順・調査履歴・縮小前の原文
- C: `docs/improvement-plan.md` — 2026-08-07レビューの指摘一覧と委任プロンプト

## Resume protocol

1. Read `AGENTS.md` and this file.
2. Verify live Git/external state; live evidence overrides recorded metadata.
3. Read only paths needed for the first unblocked action.
4. Run the smallest relevant baseline checks.
5. Execute the highest-priority unblocked action.
6. Update evidence; never convert `not-run` to PASS without execution.
