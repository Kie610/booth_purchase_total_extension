# ギフト受取状況の画面と注文内訳の移設(1.2.0)

日付: 2026-09-05 / ブランチ: 1.2.0-dev

## 目的

贈ったギフトを一覧し、受け取られていないものを見分けられる画面を追加する。
「注文ごとの内訳」をレポートページからこの画面へ移し、注文個別の確認を集約する。

## 実測した BOOTH の構造(2026-09-05、ログイン済み Chrome で確認)

- 注文詳細 `https://accounts.booth.pm/orders/<id>`: 「ギフト」見出しの `.sheet-group` 内、
  商品ごとの `.sheet` に `a[href*="/gifts/"]`(文言「ギフトを渡す」)。
  href は `https://booth.pm/gifts/<UUID>/edit`。受け取り済みでもリンクは残る。
- ギフトページ `https://booth.pm/gifts/<UUID>/edit`: 「発行日時」「受取日時」「状態」のラベル
  (`div` テキスト完全一致)の `nextElementSibling` が値。状態は「未受取」/「受取済み」。
  受取日時は未受取で「-」、受取済みで「2026年7月23日 00時06分」形式。

## 保存データ(公開契約の変更)

- `boothOrderCache[id].items[].giftId`: UUID 文字列。ギフト商品でリンクを読めた場合のみ持つ。
- `CACHE_SCHEMA_VERSION = 2`。**取り直し対象は「v < 2 かつギフト商品を含む注文」だけ**
  (`isOutdatedEntry`)。ギフトの無い v1 注文は有効のまま。
- 新キー `boothGiftStatus`: `{ [uuid]: { state: "received" | "unreceived", issuedAt, receivedAt, checkedAt } }`。
  `issuedAt`/`receivedAt` はページの文字列のまま保存(受取日時は未受取なら null)。`checkedAt` は epoch ms。
- バックアップJSON・CSV・共有文面は変更しない。

## 取得の経路

新画面に2つのボタンを置く。通常の収集(レポートページ)は booth.pm へアクセスしない。

1. 「ギフトのURLを取り直す」: `isOutdatedEntry` に該当する注文の詳細ページを再取得し v2 で保存
   (既存 `collectAmounts` の対象選定をそのまま使う。accounts.booth.pm のみ)。
2. 「受取状況を確認」: `giftId` を持ち、状態が未確認または未受取のギフトについて
   `https://booth.pm/gifts/<UUID>/edit` を取得し `boothGiftStatus` を更新。受取済みは再取得しない。
   押下時に `ext.permissions.request({ origins: ["https://booth.pm/*"] })` を行う。
   拒否されたら案内を出して中止。
   - manifest: `optional_host_permissions: ["https://booth.pm/*"]`。
   - 間隔・リトライ・実行ロック・進捗・中止は既存の収集と同じ仕組みを使う。

## 画面 `#/gifts`「ギフト・注文」

- ナビ末尾(「データの引っ越し」の後)。「作者について」はタブ列からヘッダー右側(©表記の隣)へ
  移し、幅を空ける。狭い画面のドロワーでは従来どおり末尾に置く。
- 上段「贈ったギフト」: 商品名(商品リンク)・ショップ・注文日・金額(単価×数量+BOOST)・状態・受取日時。
  並び: 未受取 → 未確認 → 受取済み、同じ状態内は注文日時の新しい順。
  絞り込み segmented: すべて / 未受取 / 受取済み(未確認は「すべて」でのみ表示し、件数を注記)。
  件数と最終確認日時、上記2ボタンと進捗・状態表示。
- 下段: 「注文ごとの内訳」(検索・ステータス・並べ替え・件数)を dashboard.html から要素ごと移設。
  レポートページには残さない。
- 状態の表記: 未受取 / 受取済み / 未確認(まだ取得していない)。giftId が無いギフト商品は
  「URL未取得」として上段に出し、ボタン1で解消できることを案内する。

## 変更するファイル

- `extension/manifest.json`: version 1.2.0、optional_host_permissions。
- `extension/dashboard-parse.js`: `giftId` の読み取り、`parseGiftPage(doc)`。
- `extension/common.js`: `CACHE_SCHEMA_VERSION`、`isOutdatedEntry`、`GIFT_STATUS_KEY`、ギフト行の組み立て。
- `extension/dashboard.html` / `dashboard.css`: 新画面、内訳の移設、ナビ、作者ボタン。
- `extension/dashboard-view.js`: ギフト表の描画、view 切替の追加。
- `extension/dashboard.js`: 2ボタンのタスク、権限要求、保存。
- `test/cases.js`: 解析(UUID・状態・日付)、取り直し判定、並び順、絞り込み。
- `README.md`: 画面の説明と権限の説明。

## 検証

- `node --check extension/*.js test/*.js`
- `test/index.html` ALL PASS(幅 768px 以上)
- 実環境: 注文 87212632(未受取1件)と 82903405(受取済み6件)で2ボタンの動作を確認。
