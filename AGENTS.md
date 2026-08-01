# リポジトリ共通ルール

## 適用範囲と優先順位

- 適用範囲: リポジトリ全体
- 優先順位: ユーザーの明示指示 > 最も近いスコープの指示 > この文書
- 正式な資料: `README.md`、`HANDOFF.agent.md`、`docs/handoff-history.md`
- 応答、コミットメッセージ、ユーザー向け文面は日本語にする。

## 守るべき設計

- 注文IDで重複除去し、注文詳細の「お支払金額」を1注文につき1回だけ集計する。
- `extension/manifest.json`、README、テスト、配布物のversionを一致させる。
- 生成済みアイコンは直接編集せず、変更時は `tools/make_icons.py` を更新して再生成する。

## 安全性と検証結果

- 関係のない変更、他worktree、外部システムを変更しない。
- 未コミット変更、`dist/` の配布物、ローカル設定は所有者を確認するまで上書き・削除しない。
- 構文・ビルド、ブラウザ実行、実環境確認を分けて報告し、未実行項目をPASSと書かない。
- BOOTHへのログイン済み通信や実ページのセレクタは、実測していない限り確認済みとしない。

## 検証コマンド

- JavaScript構文: 利用可能なNode.jsで `extension/` と `test/` の全 `.js` に `node --check` を実行する。
- 全体テスト: worktree固有ポートで `python -m http.server <port>` を起動し、`/test/index.html` の `ALL PASS` とcheck件数を確認する。
- 配布物: PowerShellで `.\tools\release.ps1` を実行し、ZIP構造、`extension/manifest.json`、SHA-256を検証する。

## 保護対象

- `extension/icons/*.png`: `tools/make_icons.py` からの生成物。
- `*.csv`、`booth*.json`: 購入履歴などの個人データとしてコミットしない。
- `docs/handoff-history.md`: 旧HANDOFFの履歴。過去情報を削除せず、新しい状態は `HANDOFF.agent.md` に書く。

## バージョンブランチと公開境界

- 現在の正式リリースと統合・配布ブランチは `1.0.0`。
- 正式リリースが確定するまでは、`main`へ直接コミット・マージ・pushしない。
- 正式リリース時は、検証済みバージョンブランチへ`main`をfast-forwardして同じコミットにそろえる。
- `main`の同期後は、ローカル・リモートの`main`とバージョンブランチが同じSHAであることを確認する。
- 統合先のブランチ名は `manifest.json` のversionと完全に一致させる。
- バージョンブランチは削除しない。次の版は正式リリース後に同期した`main`から作る。
- ある程度大きな機能追加ではマイナー番号を上げて `X.Y.0` とする。
- バグ修正や小さな機能変更ではパッチ番号を上げて `X.Y.Z` のZを更新する。
- 開発用ブランチは対象バージョンブランチから分岐し、検証後に同じバージョンブランチへ統合する。
- fast-forwardできない場合は履歴を書き換えたりforce pushしたりせず、作業を止めてユーザーへ確認する。
- push、公開、配布先への書き込みは、対象と検証結果を示してユーザーの許可を得てから行う。

## 引き継ぎの保守

- 永続ルールはこの文書、現在状態は `HANDOFF.agent.md` に置く。
- ルートの `HANDOFF.md` はリンクだけの索引に保つ。
- 置き換える詳細情報は、短縮前に `docs/handoff-history.md` へ保存する。
