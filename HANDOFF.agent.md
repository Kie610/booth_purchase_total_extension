# Agent handoff v1

updated: 2026-08-07T12:00:00+09:00
repo: https://github.com/Kie610/booth_purchase_total_extension
work_branch: 1.1.0
upstream: none (未push。pushはユーザー許可後)
base: 1.0.0@cc090b9ddbd42753522e4c050f939d43ee0a8713
goal: docs/improvement-plan.md の改善タスクをv1.1.0として統合し、検証後に正式リリースへ進める。

## State

complete:
- C: `1.0.0`ブランチを検証済みの`origin/main`先端から作成した。
- C: manifest、README、テスト、ブランチ運用文書をv1.0.0へ更新した。
- C: リリース準備コミット`90cd412e402742d6e91d6499a5ce1c145f39382e`を`origin/1.0.0`へpushし、追跡を設定した。
- C: GitHub Release `v1.0.0`を正式公開し、ZIPとSHA-256を再ダウンロードして一致を確認した。
- C: GitHub Releaseと重複するローカル`dist/`成果物は検証後に削除した。
- C: 正式リリース確定後、`main`を`1.0.0`へfast-forwardして同じコミットへ同期した。
- C: 2026-08-07のレビュー資料(docs/improvement-plan.md)を`1.0.0`へコミットした(cc090b9、未push)。
- C: `1.0.0`先端から統合・配布ブランチ`1.1.0`を作成し、manifest・README・テスト・AGENTSの
  バージョン表記をv1.1.0開発中の状態へ更新した。
- C: P2(軽微バグ修正)として improvement-plan の A1〜A3 を修正し`1.1.0`へ統合した。
  A1=share.js の共有確認文言を実挙動(取得後に全期間の合計を共有しうる)へ一致、
  A2=dashboard.js collectAmounts の進捗バー比率を (index+1)/N にしてテキストと一致、
  A3=dashboard.js の pagehide で boothDashboardTab を自タブIDと一致するときだけ削除
  (releaseDashboardTabKey。消し損ねは openDashboard 側の tabs.get 失敗時フォールバックで回復)。
  test/cases.js へ対応テストを追加(640→646 checks)。
- C: P1(UI改善)として improvement-plan の C1〜C11(+同時解消のA4・A5)を実装し`1.1.0`へ統合した。
  C1=760px以上でナビをヘッダー直下の水平タブとして常時表示(リンクは1組のまま
  applyNavLayout がドロワーと切り替え。620pxは6項目が1行に収まらないため760pxを採用)、
  C2=索引もキャッシュも無い初回に3ステップ案内(#firstRunGuide)、
  C3=月別テーブル右端に範囲選択の印(.range-pick、押す対象は従来どおり行)、
  C4=月別棒グラフにY軸目盛3段(#monthlyTrendAxis、累計グラフと同じ0/50%/最大)、
  C5=メイン合計額を28px→38px、C6=共有パネルの背景設定を「背景をカスタマイズ」
  アコーディオンへ(既定はプレビュー+文面+3ボタン。画像の形は背景設定ではないため据え置き)、
  C7=pendingBannerに閉じるボタン(件数・理由が変われば再表示。保存はしない)、
  C8=dashboard/popupへviewport meta、ヒートマップを .heatmap-scroll で横スクロール化、
  C9=confirm()をアプリ内確認ダイアログ askConfirm()(Promise<boolean>、inert・Escape・
  フォーカストラップ)へ置換、C10=メイン合計のギフトを金額下の補足行へ、
  C11=ランキングの行全体を明細開閉の対象に(リンクは遷移優先)し▸を押せる見た目へ。
  test/cases.js へ対応テストを追加(646→689 checks)。

verified:
- C: 2026-08-07 — evidence: status=PASS; kind=compile; command=node --check をextensionとtestの全.jsへ実行(claude/p1-ui-improvements、C1〜C11実装後); environment=Windows、Git Bash; scope=JavaScript構文16ファイル; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=python -m http.server 8746 --bind 127.0.0.1 を起動しBrowserで/test/index.htmlを確認(claude/p1-ui-improvements、C1〜C11実装+テスト追加後); environment=Windows、Claude Code Browser; scope=拡張機能のブラウザ全体テスト; counts=passed=689, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=scratchpadへ複製したextension一式(stub.js+デモデータ注入、注文90件・2024〜2026年)をport 8747で配信し、1280/800/620/480px幅で全6画面・共有パネル・確認ダイアログ・初回空状態をDOM計測で確認; environment=Windows、Claude Code Browser(スクリーンショットは非表示ペインのため取得不可、レイアウトはgetBoundingClientRect/scrollWidthで計測); scope=横スクロール発生箇所と操作可能性; counts=passed=6画面×4幅=24, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=compile; command=node --check をextensionとtestの全.jsへ実行(claude/p2-bugfixes、A1〜A3修正後); environment=Windows、Git Bash; scope=JavaScript構文16ファイル; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=python -m http.server 8745 --bind 127.0.0.1 を起動しBrowserで/test/index.htmlを確認(claude/p2-bugfixes、A1〜A3修正+テスト追加後); environment=Windows、Claude Code Browser; scope=拡張機能のブラウザ全体テスト; counts=passed=646, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=compile; command=node --check をextensionとtestの全.jsへ実行(1.1.0ブランチ、バージョン表記更新後); environment=Windows、Git Bash; scope=JavaScript構文16ファイル; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-08-07 — evidence: status=PASS; kind=runtime; command=python -m http.server 8744 --bind 127.0.0.1 を起動しBrowserで/test/index.htmlを確認(1.1.0ブランチ、バージョン表記更新後); environment=Windows、Claude Code Browser; scope=拡張機能のブラウザ全体テスト; counts=passed=640, failed=0, skipped=0, not-run=0
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
3. `docs/improvement-plan.md`(2026-08-07レビュー)の残りP3(効率)→P4(機能)を委任する — blocked-by: ユーザーの着手判断

## Paths

- C: `extension/manifest.json` — 拡張機能と配布物のversion
- C: `tools/release.ps1` — 配布ZIPとSHA-256の生成
- C: `AGENTS.md` — 永続的な開発・ブランチ運用ルール
- C: `docs/versioning.md` — バージョン決定、正式リリース、main同期の詳細手順
- C: `docs/handoff-history.md` — 旧HANDOFFの詳細手順と調査履歴
- C: `docs/improvement-plan.md` — 2026-08-07レビューの指摘一覧と委任プロンプト

## Resume protocol

1. Read `AGENTS.md`, `HANDOFF.agent.md`, and linked procedures.
2. Recheck branch, HEAD, worktree, upstream, remote state, and named tests.
3. Replace stale `A` and `U` entries only with current evidence.
