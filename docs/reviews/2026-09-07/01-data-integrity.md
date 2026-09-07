# 正常データの保持と注文IDの一意性に穴がある

[資料一覧へ](README.md)。5件とも親側で実関数を用いた合成検証を再実行しました。実BOOTHの通信は行っていません。再現コードは[adversarial.cjs](evidence/adversarial.cjs)です。

<a id="data-01"></a>
## DATA-01 / P1 / C：読み取り失敗が正常キャッシュを上書きする

根拠: [extension/dashboard.js:1643](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1643)。金額と明細の読み取り結果を直ちに保存対象へ置き、nullかどうかを数えるのはその後です。

1234円の正常キャッシュがある注文を強制再取得し、HTTP成功相当で解析できない文書を返すと、保存後の金額はnullになります。通信例外なら以前の値が残りますが、この経路では正常値を失います。一括再取得・範囲の再取得・ギフトURL取り直しが同じ収集関数を使います。

**最小修正案:** 新しい解析結果が必要項目を満たすまで正常キャッシュを保持し、「前回取得値・再取得失敗」を区別して表示する。正常値を残すだけで最新値と誤認させないことも必要です。

回帰条件: 金額だけ読めない、明細だけ読めない、両方読めない、正常な0円、初回収集失敗を分け、再起動後も最後の正常値と失敗状態が保たれること。

<a id="data-02"></a>
## DATA-02 / P1 / C：別タブの古いキャッシュが最新の収集結果を消す

根拠: [extension/dashboard.js:1126](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1126)、[extension/dashboard.js:1153](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1153)、[extension/dashboard.js:102](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:102)、[extension/dashboard.js:941](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:941)。

2枚のダッシュボードを開き、Aが注文1002の200円を保存した後、古い状態のBで注文履歴だけを取得すると、1002の保存済み金額が消えます。ロックで同時実行を避けても、順番に実行するだけで成立します。

stateは初期化時に読み込まれ、他タブの変更通知で同期するのはテーマだけです。実行ロック取得後に最新データを読み直さず、終了時に自タブのキャッシュ全体を保存するためです。検証は独立した2つのメモリ状態と共有storageスタブで行いました。

**最小修正案:** ロック取得後、処理対象を導出する前に最新データを読み直す。復元・削除・手動割当などの書込み経路も確認し、古い全体保存が混ざらないようにする。

回帰条件: Aの収集後にBで一覧取得・範囲収集・ギフト確認を順に実行しても、Aの成果が保持されること。実拡張の2タブstorageでの確認はUです。

<a id="data-03"></a>
## DATA-03 / P2 / C：空環境への復元だけ重複IDを除去しない

根拠: [extension/backup.js:148](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/backup.js:148)。currentがない場合はincomingをそのまま返し、その後のMapによる重複除去を通りません。入力検証も注文IDの重複を拒みません。

空環境へ「同じ注文IDが2行・金額キャッシュは1234円」を復元すると、合計は2468円になります。既存の空indexがある場合は1行へまとまり1234円です。通常の本製品が必ず重複を出力するという主張ではなく、受理する入力に対する不整合です。

**最小修正案:** 空環境でも同じID正規化を通すか、重複入力を保存前に拒否する。

回帰条件: currentがnull／空／既存注文ありの3条件で、同じ入力を二重計上しないこと。バックアップを2回読み込んでも件数と金額が増えないこと。

<a id="data-04"></a>
## DATA-04 / P2 / C：索引を削除するとキャンセル金額が復活する

根拠: [extension/dashboard.js:1033](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1033)、[extension/dashboard.js:1053](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1053)。

支払済み1234円の注文を状態再取得でキャンセルに更新すると合計から除外されます。その後に「注文履歴を削除」を実行すると、合計は1234円へ戻ります。キャッシュのstatus自体はcancelledです。

indexがある経路はtargetOrdersでキャンセルを除外しますが、indexがない経路はキャッシュを全件集計します。レポートだけでなく、同じ結果を使うCSV・共有・まとめへも波及します。

**最小修正案:** キャッシュだけから結果を作る経路にも同じキャンセル除外規則を適用する。状態が不明な値を勝手にキャンセルとみなすことは避けます。

回帰条件: キャンセルへ更新→索引削除→再表示／CSV出力でも、除外した金額を復活させないこと。

<a id="data-05"></a>
## DATA-05 / P2 / C：giftIdの型不整合を受理し、保存後の描画が止まる

根拠: [extension/backup.js:54](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/backup.js:54)、[extension/dashboard.js:216](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:216)、[extension/common.js:367](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/common.js:367)。

items[].giftIdの型を検証しないため、文字列として使えない壊れたオブジェクトを含むJSONでもparseBackupは成功します。保存後にギフト行を組み立てる段階でTypeErrorになります。renderは全画面分を描画するので、ギフト画面を開いていなくても影響します。

実関数の合成検証で、入力受理→保存→描画関数の例外を確認しました。再起動時も同じ保存値を読み込む構造ですが、実拡張での再起動は未実施です。本人の壊れたデータによる機能停止として扱い、外部侵入や権限昇格とは評価していません。

**最小修正案:** 保存前に既知フィールドgiftIdを検証し、不正な型を理由付きで拒否する。すでに保存された不正値があっても画面を回復できる読み込み処理を検討する。

回帰条件: giftIdの省略・正常UUID・不正文字列・null・配列・オブジェクトを確認し、不正入力時は既存保存データが変わらないこと。

