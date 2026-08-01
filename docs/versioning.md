# バージョンブランチと正式リリース

## バージョン番号

- 統合・配布ブランチの名前は`extension/manifest.json`のversionと完全に一致させる。
- ある程度大きな機能追加ではマイナー番号を上げて`X.Y.0`とする。
- バグ修正や小さな機能変更ではパッチ番号を上げる。
- バージョンブランチは正式リリース後も削除しない。

## 開発中

1. 同期済み`main`から次のバージョン名ブランチを作る。
2. 開発ブランチは対象バージョンブランチから分岐する。
3. 機能、文書、テストを対象バージョンブランチへ統合する。
4. 正式リリースが確定するまで`main`へ直接コミット・マージ・pushしない。

## 正式リリース

1. バージョンブランチ上で構文、ブラウザ全体テスト、配布ZIP、SHA-256を検証する。
2. バージョンブランチをpushし、ローカルと`origin/<version>`が同じSHAであることを確認する。
3. ユーザーが正式リリースを確定したら、`main`をfast-forward限定で同期する。

```powershell
git fetch origin --prune --tags
git switch main
git pull --ff-only origin main
git merge --ff-only <version>
git push origin main
```

4. `main`、`origin/main`、`<version>`、`origin/<version>`がすべて同じSHAであることを確認する。
5. 同じSHAに`v<version>`タグを付け、GitHub ReleaseへZIPとSHA-256を添付する。
6. GitHubから添付資産を再取得して一致を確認する。ローカル成果物が配布元として重複する場合は削除できる。

fast-forwardできない場合は、merge commit、rebase、force pushで解決しない。履歴差異を報告し、ユーザーの判断を待つ。

v1.0.0ではGitHub Release公開後にこの方針が確定したため、例外的にReleaseタグ作成後に`main`を同期した。拡張本体と配布ZIPの内容は変更していない。
