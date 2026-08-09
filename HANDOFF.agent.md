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
  統合内訳・実装詳細・設計判断・過去の検証証跡は docs/handoff-history.md。
- C: P10〜P12(D14〜D18、辞書レスクラスタリング化)・D19・D20を検品のうえ`1.1.0`へ統合済み
  (2026-08-09)。実装詳細は docs/improvement-plan.md の D14〜D20。
- C: D20(b01dcbd)で沼レポートを1商品=1分類の排他集計へ再設計(手動>特定アバター>
  ワールド関連>ギミック・ツール>複数対応>未分類)。`boothAvatarAssign`へ区分キー
  `__multi_tool__`/`__world__`/`__world_item__`を追加(追加のみ、既存キーの意味は不変)。
- C: D21(7809436)で未分類直前の語彙判定(`avatarVocabSlot`)を追加。誤爆ガード
  (立ち絵・音声・フォント)をテストで固定。
- C: D22(e572bd2/5f4daac/6e1ddf7)で個別ルール修正・既知商品辞書・手動割り当てUI刷新
  (区分5択+datalist検索)。BOOTH公開データ(スキ順、2026-08-09取得)から名簿を226体へ、
  `ITEM_MASTER_EXACT`(完全一致)1080件を追加。実CSVで未分類63点(金額9.5%)。
- C: 運用ルール合成(2026-08-08): AGENTS.mdへプロジェクト契約・設計の優先順位・委任と検品を追記。

verified:
- A: 2026-08-09 — evidence: status=PASS; kind=compile+runtime; command=node --check 17ファイル、
  python -m http.server 8825 + Browserで/test/index.html(claude/p15-d22=D22);
  counts=compile 17/0、ALL PASS 1053 checks。実CSV検算で点数641・金額¥529,799が全体と一致
- 前の証跡(P10=898、P11=924、P12=964、975、980、989 checks)は docs/handoff-history.md。
- 注意: 共有カードの幅依存テスト1件は、ブラウザ幅521pxでは落ちる。検証は幅768px以上で行う。

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

1. D17-c〜f・D18〜D22の実環境再確認とpush判断 — blocked-by: ユーザーの確認
2. 次回の正式リリースでも検証後にバージョンブランチ、`main`、リモートのSHAを一致させる — blocked-by: none

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
