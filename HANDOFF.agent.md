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
- A: 未統合のブランチ(統合は親が行う): `claude/p10-numa-report`(D14沼レポート)、
  `claude/p11-health-csv`(D15・D16)、`claude/p12-numa-cluster`(D17-a・D17-b)。
  P12はD14の固定辞書照合をトークン完全一致クラスタリングへ置き換え、名簿を`{jp, en, alt}`
  (約86体)へ変更した。`en`が`boothAvatarAssign`の保存キーで、P10の旧キーは名簿へ残して互換。
  公開契約は`boothAvatarAssign`とバックアップの`avatarAssign`のまま変えていない。
  1.1.0で壊れていたREADMEのFirefox記述(既存テストが期待する文言)もP12で直した。
  各ブランチの実装詳細は docs/improvement-plan.md の D14〜D17 を参照。
- C: 運用ルール合成(2026-08-08): AGENTS.mdへプロジェクト契約・設計の優先順位・委任と検品を追記。
- C: VRChatter調査(2026-08-08)より D12〜D14 と P9・P10 を improvement-plan へ起票。

verified:
- A: 2026-08-09 — evidence: status=PASS; kind=compile+runtime; command=node --check 17ファイル、
  python -m http.server 8799 + Browserで/test/index.html(P12ブランチ);
  counts=compile 17/0、ALL PASS 956 checks(924→956。P12で32件追加)、console errorなし
- 上記より前の検証証跡(P10=898 checks、P11=924 checks)は docs/handoff-history.md を参照。

not-run:
- U: U1 BOOTHログイン済み実ページの通信・ページング・セレクタ確認
  (D10のステータス再取得のみ2026-08-07にユーザー実環境で確認済み)。
- U: 実拡張として読み込んだブラウザでのD11テーマ切り替え・D14/D17沼レポート
  (実際のext.storage.local)。プレビュー複製での確認のみ済み。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへfast-forwardする。
- C: versionと同名のブランチを作り、削除せず残す。
- C: 大きな機能追加はマイナー、バグ修正や小さな機能変更はパッチ番号を更新する。
- A: D14の伏せ字共有ではアバター名を出す(素体名は広く共有された呼び名で個人特定性が低い)。
- C: 正式対応はChromeのみ。Firefoxは一時読み込み運用に限定し署名・AMO対応は不採用(2026-08-09)。

## Next

1. P10(沼レポート)・P11(警報+CSV注記)の実環境フィードバックを反映する — blocked-by: ユーザーの確認
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
