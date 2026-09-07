# Codex SecurityはCSVの文字列境界をLow 1件として記録した

[資料一覧へ](README.md)。専用スキャンは完了しました。静的に実行ソース25ファイルを確認し、親がソースの値の流れと合成出力を検品しています。独立した新規コンテキストでのbaseline起動は枠制限で失敗したため、既存担当を継続しました。完全に独立した再監査を複数回行った結果ではありません。

<a id="sec-01"></a>
## SEC-01 / P3・Low / C＋U：CSVの名称が数式として解釈され得る

根拠: [extension/csv.js:11](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/csv.js:11)、[extension/csv.js:92](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/csv.js:92)、[extension/dashboard-parse.js:151](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-parse.js:151)、[extension/dashboard-parse.js:214](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard-parse.js:214)。

商品の名称とショップの名称は、取得HTMLから商品明細へ保存され、CSVの文字列列へ渡されます。共通変換は区切り・改行・引用符を処理しますが、数式としての解釈を防ぎません。合成の算術式を名称にすると、等号開始の文字列がそのまま出力されることを確認しました。

CSVの引用と、表計算アプリで文字列として扱うための対策は別です。画面もExcelで開く使い方を案内しています。この種類の問題と、対策がアプリ・再保存操作に依存する点は[OWASPのCSV Injection解説](https://owasp.org/www-community/attacks/CSV_Injection)も説明しています。

| 確定度 | 確認内容 |
| --- | --- |
| C | 名称が未変換で出力CSVに到達する。既存のCSV引用は列構造を保護する |
| A | 商品名・ショップ名を制御できる相手と、数式解釈する表計算アプリを想定する |
| U | 現行BOOTHの名称制約、実Excelの読み込み・再保存後の挙動 |
| U | 外部通信・情報流出・任意コード実行への発展。実証していない |

明示的なCSV保存と別アプリでの開封が必要で、入力制約とアプリの保護設定にも左右されます。この条件を踏まえ、Codex SecurityではLow、信頼度mediumとしました。侵入成功や情報流出を確認したという指摘ではありません。

**最小修正案:** 文字列列と数値列を区別し、利用する表計算アプリで安全に文字列として扱う規則を検証して適用する。数値列の集計可能性を保持する。一律に引用符を付けるだけの修正では不足します。CSVは公開契約なので、下流の取り込みへの影響も確認します。

回帰条件は、通常名・数式開始文字・制御文字・引用符・改行、正常な数値列、対象アプリでの初回開封と保存後の再開封です。

## 攻撃成立とは扱わなかったもの

| 観点 | ソースから確認できたこと・限界 |
| --- | --- |
| DOM XSS | 監査した外部文字列の表示はtextContentやcanvas。innerHTML代入は消去用途。実行可能HTMLとして挿入する経路は見つからない |
| ショップ・ギフトのリンク | BOOTHショップのHTTPS形式、固定origin、UUID等の制限がある |
| 注文取得URL | 表示用IDガードを通らず固定prefixへ直接連結する。別originを直接指定する経路とは違うが、同一originの別パスの影響はU。有害なGET先や権限逸脱は確認していない |
| ギフトメモ等の削除残留 | 所有者の保存データであり、新たな未認可アクセスは確認していない。[UX-04](03-ux.md#ux-04)として記録 |
| 壊れたバックアップ | [DATA-05](01-data-integrity.md#data-05)の堅牢性問題。自己データの破損を高重大度の脆弱性にしない |
| 画像・共有 | 背景画像の処理はタブ内。Xは固定intent URLへ明示操作で文面を渡す。画像の自動投稿は見つからない |
| manifest | content script・background・externally_connectable・web_accessible_resourcesはない。スクリプトとCSSはローカル参照 |
| テスト・開発ツール | 購入データはAPIスタブへ保存。配布処理はextensionと配布文書をコピーし、testは含めない |

DOMParserの文書を保持して700ms観測したChrome 152では、img・iframeへの追加要求は0でした。ただし[MDN](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString)は取得し得ると説明しているため、[extension/dashboard.js:1316](D:/GitHub_WorkSpace/BrowserExtension/booth_purchase_total_extension/booth_purchase_total_extension/extension/dashboard.js:1316)のコメントには検証環境・条件を付けるのが妥当です。漏えいの成立とは判定しておらず、18件の指摘件数には含めません。

## 専用スキャンの原本と保存内容

scan ID: `a7ee0ead-e497-4442-baf6-4376638a13fc`。標準スキャンの状態はcomplete、coverageはpartialです。同一originの注文取得URLに未解決点を残しています。

- [生成されたCodex Securityレポート](C:/Users/Kie/AppData/Local/Temp/codex-security-scans-rgK9ha/booth_purchase_total_extension/ed324dfd93dc22aa1dffc74df4b412bb8f88ec4a_20260906T161559Z_at9is0an/report.md)
- [公式取得ツールが返したmanifest・findings・coverageの保存スナップショット](evidence/codex-security-result.json)
- [通常レビューの合成チェック](evidence/security.cjs)／[結果](evidence/security-results.json)

原本の生成・検証・索引登録は専用ツールが成功を返しました。原本ディレクトリはこの環境のシェルから読み取れないため、保存スナップショットは公式のcompleted-scan取得ツールから保存しています。原本のsealedファイルを作り直したものではありません。

TACはnot_granted、grantsは空でした。保護された出力の表示に制限が生じ得ます。[TAC申請](https://chatgpt.com/cyber)。測定値と手順上の制約は[検証資料](06-verification.md)へ記録しました。

