# 検証の範囲、結果、再実行手順

[資料一覧へ](README.md)。対象コミットと作業時点のブランチ状態は[HANDOFF.agent.md](../../../HANDOFF.agent.md)のレビュー記録にあります。保存資料はその時点の観測であり、後続の修正へ自動的に適用できません。

## 確認できたこと

| 種類 | 結果 | 条件・証拠 |
| --- | --- | --- |
| 構文 | 17ファイル成功、失敗0 | extension・testの全JavaScriptへnode --check |
| 既存ブラウザテスト | ALL PASS、1,141 checks、JavaScript例外0 | [baseline.txt](evidence/baseline.txt)、Chrome 152.0.7977.76、1280×900 |
| データ整合性の敵対的チェック | 2成功・5失敗、終了コード1 | [コード](evidence/adversarial.cjs)／[結果](evidence/adversarial-results.txt)。失敗5件がDATA-01〜05を再現 |
| 通常レビューのセキュリティチェック | 観測11件一致 | [コード](evidence/security.cjs)／[結果](evidence/security-results.json)。脆弱なCSV出力や削除残留も「観測一致」に含む |
| コメント・未使用コード・計算のチェック | 観測5件一致 | [コード](evidence/maintenance.cjs)／[結果](evidence/maintenance-results.txt) |
| 画面表示 | 8画面、JavaScript例外0 | [ブラウザ結果](evidence/browser-results.json)。合成48注文・48商品・7ショップ・ギフト16件 |
| 狭い画面 | ギフト画面のページ幅620px | 表のコンテナ内に横スクロール。全画面の幅620px監査ではない |
| 外部通信 | ブラウザ計測でブロック対象0要求 | localhost以外を拒否するルートを設定。実BOOTHへの収集ボタンは実行していない |
| Codex Security | complete、Low 1件、coverage partial | [専用スキャンの保存結果](evidence/codex-security-result.json)、[解釈と限界](02-security.md) |

成功数は混ぜて合計しません。既存テストの成功、欠陥を発見した失敗、脆弱な挙動を確認した成功は、それぞれ意味が違います。

Nodeの再現コードは、製品関数をソースから読み込み、合成データ・スタブの保存先・ダイアログ・通信を使います。購入履歴を読み込む処理やBOOTHへのネットワーク要求はありません。製品コードをコピーして別実装へ置き換えたテストではありませんが、関数の切り出しとスタブで省略した実ブラウザAPIまでは検証しません。

ブラウザの画面確認は、実dashboard.htmlをHTTP応答内で加工してtest/stub.jsと合成データを挿入しています。製品ファイルは編集していません。既存テストには初期化停止フラグの不整合があり、詳しくは[COM-04](04-comments.md#com-04)を参照してください。

## 再実行する

PowerShellでリポジトリのルートへ移動して実行します。Node.jsはv24.18.1を使用しました。

```powershell
Set-Location -LiteralPath 'D:\GitHub_WorkSpace\BrowserExtension\booth_purchase_total_extension\booth_purchase_total_extension'
node docs/reviews/2026-09-07/evidence/adversarial.cjs
node docs/reviews/2026-09-07/evidence/security.cjs
node docs/reviews/2026-09-07/evidence/maintenance.cjs
```

adversarial.cjsは修正前の対象コードで5件失敗し、終了コード1になります。ほかの2本は、欠陥を含む観測が一致すると成功するため、修正後は期待値の更新が必要です。security.cjsは同じフォルダのsecurity-results.jsonを更新します。ソースの関数名や区切りが変わった場合は、抽出箇所も見直してください。

ブラウザ検証には、別ターミナルでルートを配信します。

```powershell
& 'C:\Users\Kie\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 8732 --bind 127.0.0.1
```

```powershell
node docs/reviews/2026-09-07/evidence/browser.cjs
```

[browser.cjs](evidence/browser.cjs)は、この端末に既存のPlaywrightとChromeを明示パスで使用します。他環境ではファイル冒頭のPlaywright参照とChromeのexecutablePathを変更してください。実行でbaseline.txt・browser-results.json・PNGを更新します。監査時は専用のheadlessブラウザを使い、終了時に閉じています。

構文確認は次のとおりです。配布ZIPは製品変更がないため再生成していません。

```powershell
$reviewFiles = Get-ChildItem -LiteralPath 'extension','test' -Filter '*.js' -File
foreach ($reviewFile in $reviewFiles) {
    node --check $reviewFile.FullName
    if ($LASTEXITCODE -ne 0) { throw "構文エラー: $($reviewFile.Name)" }
}
```

## 性能測定の読み方

[EFF-01](05-efficiency.md#eff-01)に記載した値は、保存した最終結果の5回中央値です。Chromeのrenderは1,000注文102.6ms、5,000注文349.5ms。Nodeの部分集計は1,000注文17.3ms、5,000注文84.7ms、10,000注文167.2msでした。

ChromeはDOM更新を含み、後続の描画完了までは含みません。Nodeはアバター分類2回と年間集計1回だけです。並行作業のある1台での合成データ測定で、厳密な性能ベンチマークや改善前後の比較ではありません。測定値は実行負荷・商品名・年の分布・ブラウザ状態で変わります。原因の切り分けと優先順位の判断に使います。

## Codex Securityの実施条件

専用プラグインの標準スキャンを完了しました。実行ソース25ファイル（製品18・テスト5・開発ツール2）を静的に監査し、指摘候補は親が再現・検品しました。新規コンテキストでの独立baseline担当の起動はエージェント枠の制限で失敗し、既存担当を継続しています。

TACはnot_grantedで、敵対的担当の最終出力1件は保護機構により遮断されました。通常のローカル再現コードについては、親がファイルと実行結果を検品しています。保護された最終回答を取得・復元したものではありません。スキャンが完了したことと、すべての出力を閲覧できたことは別です。

完了ツールの使用量報告は、入力5,763,644 tokens（うちcached 5,664,512）、出力25,501、合計5,789,145です。reasoning 6,294も別フィールドで記録されています。計測元はcodex_rollout、threadCountは1です。専用スキャンだけの追加費用やサブエージェントを含む全費用と解釈しません。

## 実施していないこと

- ログイン済みBOOTHへの実通信、ページング・セレクタ・アクセス制限の再確認。
- 実拡張のインストール、optional権限の許可、実クリップボード、ギフトURLのアクセス、実端末間の復元。
- Excel等でのCSV開封・再保存、情報流出や任意コード実行の実証。
- 全テーマ・全画面サイズ・キーボード・スクリーンリーダーの総合アクセシビリティ監査。
- 表示用リンクの制限と別経路にある、同一originの注文取得URLの影響確定。
- ソース修正、コミット、push、リリース。

コメントアウトした実行コードの大きな残骸や、監査範囲内での実行可能HTML挿入経路は見つかりませんでした。検索・確認範囲で見つからなかったという結果であり、全条件での不存在の証明ではありません。
