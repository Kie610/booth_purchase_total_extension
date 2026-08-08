# Agent handoff v1

updated: 2026-08-08
repo: https://github.com/Kie610/booth_purchase_total_extension
work_branch: 1.1.0
upstream: origin/1.1.0 (2026-08-08にユーザー許可を得てpush・追跡設定済み)
base: 1.0.0@cc090b9ddbd42753522e4c050f939d43ee0a8713
goal: docs/improvement-plan.md の改善タスクをv1.1.0として統合し、検証後に正式リリースへ進める。

## State

complete:
- C: v1.0.0を正式リリース済み(GitHub Release公開、`main`を同じSHAへfast-forward同期済み)。
- C: `1.1.0`へP1〜P9を統合済み。P2=A1〜A3、P1=C1〜C11(+A4・A5)、P3=B1〜B4(+TDZホットフィックス)、
  P4=D1〜D5、P6=C12〜C15(+[hidden]ホットフィックス)、P7=C16〜C18・D10・T1、P8=D11、
  P9=D12・D13(Opus 5委任、8d295cf、ランキングカードの月別棒グラフのみ見送り)。
  実装詳細・設計判断・過去の検証証跡の全文は docs/handoff-history.md
  「2026-08-08 HANDOFF.agent.md 縮小前の原文」を参照。
- C: 運用ルール合成(2026-08-08): AGENTS.mdへプロジェクト契約・設計の優先順位・委任と検品を追記し、
  本ファイルを縮小した(原文は履歴へ保存済み)。
- C: VRChatter調査(2026-08-08)より D12〜D14 と P9・P10 を improvement-plan へ起票(不採用案も同書に記録)。

verified:
- C: 2026-08-08 — evidence: status=PASS; kind=compile; command=node --check をextensionとtestの
  全.jsへ実行(P9統合後の1.1.0=8d295cf); counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-08-08 — evidence: status=PASS; kind=runtime; command=python -m http.server 8783 +
  Browserで/test/index.htmlを確認(P9統合後); counts=passed=830, failed=0(794→830。P9で36件追加)
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=ユーザーが実環境でD10「物理アイテムの
  ステータスを再取得」を確認したと報告; counts=確認1件, failed=0
- C: 2026-08-08 — evidence: status=PASS; kind=runtime; command=ユーザー実ブラウザでBOOTH注文詳細20件を
  実測; scope=nameへのバリエーション名連結・ファイル名行・既存セレクタ健在(D14前提); counts=20件, failed=0
- 上記より前の検証証跡の全文は docs/handoff-history.md を参照。

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認
  (D10のステータス再取得のみ2026-08-07にユーザー実環境で確認済み)。
- U: U2 Firefoxの署名、配布パッケージ、恒久利用は未対応。
- U: 実拡張として読み込んだブラウザでのD11テーマ切り替え(実際のext.storage.local)。
  プレビュー複製での確認のみ済み。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへfast-forwardする。
- C: versionと同名のブランチを作り、削除せず残す。
- C: 大きな機能追加はマイナー、バグ修正や小さな機能変更はパッチ番号を更新する。

## Next

1. P10(D14沼レポート)を委任する — blocked-by: ユーザーの着手判断
2. `docs/improvement-plan.md` の残りP5(Firefox調査)を委任する — blocked-by: ユーザーの着手判断
3. 次回の正式リリースでも検証後にバージョンブランチ、`main`、リモートのSHAを一致させる — blocked-by: none

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 永続的な開発・ブランチ運用ルール
- C: `docs/versioning.md` — バージョン決定、正式リリース、main同期の詳細手順
- C: `docs/handoff-history.md` — 旧HANDOFFの詳細手順・調査履歴・縮小前の原文
- C: `docs/improvement-plan.md` — 2026-08-07レビューの指摘一覧と委任プロンプト

## Resume protocol

1. Read `AGENTS.md`, `HANDOFF.agent.md`, and linked procedures.
2. Recheck branch, HEAD, worktree, upstream, remote state, and named tests.
3. Replace stale `A` and `U` entries only with current evidence.
