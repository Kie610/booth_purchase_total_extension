# Agent handoff v1

updated: 2026-08-02T03:08:09+09:00
repo: https://github.com/Kie610/booth_purchase_total_extension
work_branch: 1.0.0
upstream: origin/1.0.0
base: v1.0.0@7e884d281670268fab893e83f408c16f08c7bb61
goal: 正式リリース時に永続バージョンブランチとmainを同じ検証済みコミットへ同期する。

## State

complete:
- C: `1.0.0`ブランチを検証済みの`origin/main`先端から作成した。
- C: manifest、README、テスト、ブランチ運用文書をv1.0.0へ更新した。
- C: リリース準備コミット`90cd412e402742d6e91d6499a5ce1c145f39382e`を`origin/1.0.0`へpushし、追跡を設定した。
- C: GitHub Release `v1.0.0`を正式公開し、ZIPとSHA-256を再ダウンロードして一致を確認した。
- C: GitHub Releaseと重複するローカル`dist/`成果物は検証後に削除した。
- C: 正式リリース確定後、`main`を`1.0.0`へfast-forwardして同じコミットへ同期した。

verified:
- C: 2026-08-02 — evidence: status=PASS; kind=compile; command=PowerShellでextensionとtestの全.jsへbundled node.exe --checkを実行; environment=Windows PowerShell、Node.js bundled runtime 26.731.11130; scope=JavaScript構文16ファイル; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-08-02 — evidence: status=PASS; kind=runtime; command=python.exe -m http.server 8731 --bind 127.0.0.1を起動しBrowserでhttp://127.0.0.1:8731/test/index.htmlを確認; environment=Windows、Codex In-app Browser; scope=拡張機能のブラウザ全体テストとconsole error・warning; counts=passed=640, failed=0, skipped=0, not-run=0
- C: 2026-08-02 — evidence: status=PASS; kind=compile; command=.\tools\release.ps1を実行しExpand-ArchiveとSHA-256比較で検証; environment=Windows PowerShell; scope=v1.0.0配布ZIPの25ファイル、単一ルート、manifest、チェックサム; counts=passed=25, failed=0, skipped=0, not-run=0
- C: 2026-08-02 — evidence: status=PASS; kind=compile; command=python validate_handoff.py --root repository-root; environment=Windows、agent-handoff validator; scope=AGENTS、CLAUDE、HANDOFF、HANDOFF.agentの63 checks; counts=passed=63, failed=0, skipped=0, not-run=0

not-run:
- U: U1 BOOTHログイン済み実ページでの通信、ページング、セレクタ確認はローカルリリースビルドの範囲外。
- U: U2 Firefoxの署名、配布パッケージ、恒久利用は未対応。

## Decisions

- C: 開発中はバージョンブランチへ統合し、正式リリース確定時に`main`を同じSHAへfast-forwardする。
- C: versionと同名のブランチを作り、削除せず残す。
- C: 大きな機能追加はマイナー、バグ修正や小さな機能変更はパッチ番号を更新する。

## Next

1. 次の変更では規模に応じ、同期済み`main`から新しい永続バージョンブランチを作る — blocked-by: none
2. 次回の正式リリースでも検証後にバージョンブランチ、`main`、リモートのSHAを一致させる — blocked-by: none

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 永続的な開発・ブランチ運用ルール
- C: `docs/versioning.md` — バージョン決定、正式リリース、main同期の詳細手順
- C: `docs/handoff-history.md` — 旧HANDOFFの詳細手順と調査履歴

## Resume protocol

1. Read `AGENTS.md`, `HANDOFF.agent.md`, and linked procedures.
2. Recheck branch, HEAD, worktree, upstream, remote state, and named tests.
3. Replace stale `A` and `U` entries only with current evidence.
