# 現在の動作を説明しないコメントとテスト前提を直す

[資料一覧へ](README.md)。実行コードをコメントアウトした明確な残骸は、初回レビューの検索・確認では見つかりませんでした。以下は修正前の指摘です。後続の修正状況は[HANDOFF.agent.md](../../../HANDOFF.agent.md)を参照してください。

<a id="com-01"></a>
## COM-01 / P3 / C：受取済みを「二度と取りに行かない」と断言する

根拠: [extension/common.js:16](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/common.js:16)、[extension/dashboard.js:40](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:40)、[extension/dashboard.js:1738](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1738)。

通常確認は受取済みを除外しますが、キャッシュ無視の再取得では含めます。実関数へ受取済み1件を渡すと、通常0件・force指定1件でした。メモ変更を拾うための経路です。

修正文の例: 「通常確認では受取済みを除外する。キャッシュを無視する場合は、受取済みを含めてメモも取り直す」。保存データの形を説明する箇所にはmemoも記載します。

<a id="com-02"></a>
## COM-02 / P3 / C：沼レポートの説明に旧方式と開発履歴が残る

根拠: [extension/dashboard.html:508](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.html:508)、[extension/common.js:1183](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/common.js:1183)、[extension/avatar-master.js:7](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/avatar-master.js:7)。

HTMLコメントは末尾の括弧と辞書の照合に説明を寄せていますが、実装は手動割当・バリエーション・品名本体・複数対応を扱い、購入商品から候補も組み立てます。画面の説明にも末尾のバリエーションを中心とした表現が残っています。D14/D17や個人データの測定経緯だけでは、現在の責務を理解できません。

修正案: 現在使う入力と優先順位、追加の商品ページ通信をしない制約を説明する。履歴や測定値は既存の詳細資料へ置き、根拠が必要な箇所から参照する。有効な分類理由まで削除しません。

<a id="com-03"></a>
## COM-03 / P3 / C：保存間隔を「20回前後」「最悪15秒」と保証する

根拠: [extension/dashboard.js:13](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:13)。

cacheFlushIntervalは5〜50件です。1万件すべて取得できた場合、定期保存は200回になります。0.3秒はリクエスト間の待機で、通信・解析・再試行時間を含みません。したがって、失う取得時間の上限を15秒とは言えません。

修正文の例: 「5〜50件ごとに保存を開始する。未保存の範囲は書込みの完了状況に依存し、取得時間は通信状況に依存する。大規模収集では全量保存の累積書込み量が二次的に増える」。異常終了時の保存や実ストレージ障害まで保証する説明にはしません。

<a id="com-04"></a>
## COM-04 / P3 / C：テストの初期化停止属性がガードを止めない

根拠: [test/index.html:9](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/test/index.html:9)、[extension/dashboard.js:112](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:112)、[extension/dashboard.js:906](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:906)。

test/index.htmlのbodyには値のないdata-no-auto-init属性があります。このdataset値は空文字です。コードは存在確認ではなく値の真偽を否定しているため、テーマ初期化もinitも実行されます。「テストでは非同期初期化を止める」という説明が成立していません。

修正案: 属性の存在をhasAttributeで確認するか、テスト側で真と扱う値を明示する。2か所の条件をそろえ、自動初期化が呼ばれないことを観測する小さなテストを追加する。

既存1,141件が通った事実は変わりません。ただし、停止属性による隔離は保証されておらず、購入データの隔離はAPIスタブが担っています。競合による既存テストの失敗は今回再現していません。

## 追加確認に留めたコメント

[extension/dashboard.js:1316](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1316)のDOMParserの「サブリソースも取得されない」は検証条件がありません。今回のChromeでは0要求でしたが、全ブラウザの保証へ広げられません。環境と一次資料を[セキュリティ資料](02-security.md)に記録し、不具合件数には含めていません。
