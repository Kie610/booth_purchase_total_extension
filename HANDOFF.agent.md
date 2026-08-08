# Agent handoff v1

updated: 2026-08-09
repo: https://github.com/Kie610/booth_purchase_total_extension
work_branch: 1.1.0
upstream: origin/1.1.0 (2026-08-08にユーザー許可を得てpush・追跡設定済み)
base: 1.0.0@cc090b9ddbd42753522e4c050f939d43ee0a8713
goal: docs/improvement-plan.md の改善タスクをv1.1.0として統合し、検証後に正式リリースへ進める。

## State

complete:
- C: v1.0.0を正式リリース済み(GitHub Release公開、`main`を同じSHAへfast-forward同期済み)。
- C: `1.1.0`へP1〜P9(A1〜A5・B1〜B4・C1〜C18・D1〜D5・D10〜D13・T1)を統合済み。
  統合内訳・実装詳細・設計判断・過去の検証証跡は docs/handoff-history.md を参照。
- A: P10(D14沼レポート)を`claude/p10-numa-report`で実装済み(統合は親が行う)。新ビュー`#/avatars`、
  辞書`extension/avatar-master.js`(33体)、公開契約へ`boothAvatarAssign`とバックアップの
  `avatarAssign`を追加(BACKUP_VERSIONは1のまま。旧バックアップも読める)。
- C: 運用ルール合成(2026-08-08): AGENTS.mdへプロジェクト契約・設計の優先順位・委任と検品を追記。
- C: VRChatter調査(2026-08-08)より D12〜D14 と P9・P10 を improvement-plan へ起票。

verified:
- A: 2026-08-09 — evidence: status=PASS; kind=compile+runtime; command=node --check 17ファイル、
  python -m http.server 8791 + Browserで/test/index.html(P10ブランチ);
  counts=compile 17/0、ALL PASS 898 checks(830→898。P10で68件追加)、console errorなし
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=ユーザーが実環境でD10「物理アイテムの
  ステータスを再取得」を確認したと報告; counts=確認1件, failed=0
- C: 2026-08-08 — evidence: status=PASS; kind=runtime; command=ユーザー実ブラウザでBOOTH注文詳細20件;
  scope=nameへのバリエーション名連結・ファイル名行(D14前提); counts=20件, failed=0
- 上記より前の検証証跡は docs/handoff-history.md を参照。

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認
  (D10のステータス再取得のみ2026-08-07にユーザー実環境で確認済み)。
- U: U2 Firefoxの署名、配布パッケージ、恒久利用は未対応。
- U: 実拡張として読み込んだブラウザでのD11テーマ切り替え・D14沼レポート
  (実際のext.storage.local)。プレビュー複製での確認のみ済み。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへfast-forwardする。
- C: versionと同名のブランチを作り、削除せず残す。
- C: 大きな機能追加はマイナー、バグ修正や小さな機能変更はパッチ番号を更新する。
- A: D14の伏せ字共有ではアバター名を出す(素体名は広く共有された呼び名で個人特定性が低い)。

## Next

1. P10(`claude/p10-numa-report`)を検品して`1.1.0`へ統合する — blocked-by: none
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
