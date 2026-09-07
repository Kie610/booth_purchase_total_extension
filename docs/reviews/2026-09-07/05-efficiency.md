# 非表示ページの描画を減らす方が、細かな短縮より効果が大きい

[資料一覧へ](README.md)。以下は初回レビュー時点の改善案と測定値です。後続の修正状況は[HANDOFF.agent.md](../../../HANDOFF.agent.md)を参照してください。

<a id="eff-01"></a>
## EFF-01 / P2 / C：8ページを毎回まとめて描画する

根拠: [extension/dashboard-view.js:707](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-view.js:707)、[extension/dashboard-insights-view.js:441](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-insights-view.js:441)、[extension/dashboard-insights-view.js:556](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-insights-view.js:556)、[extension/dashboard-view.js:1520](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-view.js:1520)。

renderは、表示していないランキング・沼レポート・年間まとめ・ギフト表なども再計算・DOM更新します。アバター分類は別の表示から重ねて実行されます。初期表示・収集終了・復元・手動割当・集計対象変更が影響を受けます。

| 測定条件 | 1,000注文 | 5,000注文 | 10,000注文 |
| --- | ---: | ---: | ---: |
| Chromeのrender全体、5回中央値 | 102.6ms | 349.5ms | 未測定 |
| Nodeのアバター分類2回＋年間まとめ1回、5回中央値 | 17.3ms | 84.7ms | 167.2ms |

Chromeはデータ出力画面を表示、1注文1商品、1280×900。DOM更新を含みますが、後続のpaintや利用者が感じる待ち時間そのものではありません。Nodeは部分集計だけでDOMを含みません。両者を足したり、別端末の性能とみなしたりしません。

**最小修正案:** 共通部分と表示中ページを描画し、移動先を選んだときにそのページを描画する。共有用状態やフッターの更新依存を確認する。先に永続キャッシュや汎用の描画管理機構を増やす必要はありません。

<a id="eff-02"></a>
## EFF-02 / P3 / C：表示にも出力にも使わない年間BOOST集計がある

delete: [extension/common.js:1566](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/common.js:1566)。

buildYearSummaryのboostとboostItemCountは製品側の消費者がなく、テスト2件だけが読みます。関係する初期化・集計・返却値・専用テストを削除する案です。推定削減は本体約12行、テスト約5行です。

**保持するもの:** 商品単位item.boost、金額への加算、保存形式、バックアップ検証、CSV列。これらは現に利用される公開契約です。速度差は未計測なので、性能改善の主役とはしていません。

<a id="eff-03"></a>
## EFF-03 / P3 / C：headingLabelは呼ばれていない

delete: [extension/dashboard-parse.js:118](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-parse.js:118)。

extensionとtestの全JavaScriptから検索して定義1件だけでした。関数と後続の空行で推定5行を削除できます。隣のvalueAfterHeadingは実際に使われるため保持します。

## 削除しないもの

短いという理由だけでgiftViewResultsを削除しません。このページへ集計対象フィルターを掛けない責務を示しています。item.boostや外部データの検証、エラー時の保存処理も短縮のために取り除きません。

削除候補2件の合計は推定22行、依存追加・削除は0です。未適用の概算であり、実際に削減した行数ではありません。
