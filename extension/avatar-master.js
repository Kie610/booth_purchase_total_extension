"use strict";

// D14/D17 沼レポート(アバター別支出内訳)のアバター名簿。
//
// **ここはデータだけのファイル。照合の規則は common.js にある。**
//
// D17 でのねらいの変更(2026-08-09 のユーザー実データ637明細で実測):
// これは「網羅する辞書」ではない。VRChat向けアバターは数万体あり毎日増えるので、
// 辞書に載っているものだけ当てにいく方式は原理的に破綻する。実際、D14の固定辞書33体では
// 金額の15.5%しか特定できず、辞書に無い「凪」は1点も拾えなかった。
//
// D17 の照合は、バリエーション名を分解したトークンを商品どうしで突き合わせ、
// 2商品以上に現れたトークンを自動でアバターのバケツにする(common.js の buildAvatarIndex)。
// 名簿に載っていないアバターも、買っていれば自動で順位表に出る。
// この名簿が受け持つのは次の3つだけで、網羅は目的にしていない。
//   1. 表記ゆれの統合 …… 「まぬか」と "manuka" を同じバケツへまとめる
//   2. 表示名 …………… バケツを日本語表記で見せる
//   3. 1商品でも採用 …… 名簿にある名前は、1商品にしか出てこなくてもバケツにする
//
// jp  … 日本語表記。バケツの表示名になる
// en  … ローマ字表記。**これが保存キー**なので後から変えない
//        (変えると `boothAvatarAssign` に保存済みの手動割り当てが迷子になる)
// alt … 追加の別表記(略記・旧つづり・P10で使っていた旧キー)。省略可
const AVATAR_MASTER = Object.freeze([
  { jp: "マヌカ", en: "manuka" },
  { jp: "しなの", en: "shinano" },
  { jp: "キプフェル", en: "kipfel" },
  { jp: "ミルティナ", en: "milltina", alt: ["miltina"] },
  { jp: "ルルネ", en: "rurune" },
  { jp: "まめひなた", en: "mamehinata" },
  { jp: "桔梗", en: "kikyo", alt: ["kikyou"] },
  { jp: "セレスティア", en: "selestia" },
  { jp: "ショコラ", en: "chocolat" },
  { jp: "しお", en: "sio" },
  { jp: "真冬", en: "mafuyu" },
  { jp: "エク", en: "eku" },
  { jp: "ミルフィ", en: "milfy", alt: ["ミルフ"] },
  { jp: "狛乃", en: "komano" },
  { jp: "マリシア", en: "marycia" },
  { jp: "カリン", en: "karin" },
  { jp: "フェリス", en: "felis" },
  { jp: "真央", en: "mao" },
  { jp: "舞夜", en: "maiya", alt: ["maya"] },
  { jp: "ルミナ", en: "lumina" },
  { jp: "ラスク", en: "rusk" },
  { jp: "ラシューシャ", en: "lasyusha" },
  { jp: "瑞希", en: "mizuki" },
  { jp: "萌", en: "moe" },
  { jp: "シフォン", en: "chiffon" },
  { jp: "ラプウィング", en: "lapwing" },
  { jp: "ラムネ", en: "ramune" },
  { jp: "墨惺", en: "bokusei" },
  { jp: "イチゴ", en: "ichigo" },
  { jp: "愛莉", en: "airi" },
  { jp: "竜胆", en: "rindou", alt: ["rindo"] },
  { jp: "斑霞", en: "hanka" },
  { jp: "彼方", en: "kanata" },
  { jp: "アルエ", en: "alue" },
  { jp: "リナシータ", en: "rinasciita" },
  { jp: "輝夜", en: "kaguya" },
  { jp: "まよ", en: "mayo" },
  { jp: "アッシュ", en: "ash" },
  { jp: "ハオラン", en: "haolan" },
  { jp: "ライム", en: "lime" },
  { jp: "うささき", en: "usasaki" },
  { jp: "プラチナ", en: "platinum" },
  { jp: "プラム", en: "plum" },
  { jp: "ナユ", en: "nayu" },
  { jp: "くうた", en: "kuuta" },
  { jp: "クマリ", en: "kumaly" },
  { jp: "ウェンディ", en: "wendy" },
  { jp: "凪", en: "nagi" },
  { jp: "フィオナ", en: "fiona" },
  { jp: "海咲", en: "misaki" },
  { jp: "ソフィナ", en: "sophina" },
  { jp: "水瀬", en: "minase" },
  { jp: "獏", en: "baku" },
  { jp: "泣夜", en: "nakiya" },
  { jp: "ゼヴ", en: "zev" },
  { jp: "華夜", en: "kaya" },
  { jp: "しらつめ", en: "shiratsume" },
  { jp: "薄荷", en: "hakka" },
  { jp: "珀杏", en: "hakua" },
  { jp: "ルシナ", en: "rushina" },
  { jp: "ルーシュカ", en: "rushka" },
  { jp: "ルーニャ", en: "runya" },
  { jp: "ルーナリット", en: "lunalitt" },
  { jp: "ぽわり", en: "powari" },
  { jp: "まるぼでぃ", en: "marubody" },
  { jp: "うるる", en: "ururu" },
  { jp: "フレーナ", en: "freina" },
  { jp: "カザリス", en: "cazalis" },
  { jp: "凪夜", en: "nagiya" },
  { jp: "ミント", en: "mint" },
  { jp: "フレア", en: "flare" },
  { jp: "ミーシェ", en: "mische" },
  { jp: "ここあ", en: "cocoa", alt: ["kokoa"] },
  { jp: "森羅", en: "shinra" },
  { jp: "MUMUS", en: "mumus" },
  // ここから下は D14(P10)の辞書にあった素体。当時の保存キーをそのまま en に残し、
  // 旧版で手動割り当てしたデータが名前付きのまま読めるようにしている
  { jp: "チセ", en: "chise" },
  { jp: "みなも", en: "minamo" },
  { jp: "しずく", en: "shizuku" },
  { jp: "十六夜", en: "izayoi" },
  { jp: "あのん", en: "anon" },
  { jp: "幽狐", en: "yuko", alt: ["yuuko"] },
  { jp: "グルス", en: "grus" },
  { jp: "リーファ", en: "leefa" },
  { jp: "イメリス", en: "imeris" },
  { jp: "サッチ", en: "sacchi" },
  { jp: "ルルカ", en: "ruruka" },
]);

// 「1つの素体だけの商品ではない」ことを名乗る表記。これが入っていれば、
// 素体名が1つしか読み取れなくても「複数対応」として扱う
// (Full Pack は複数素体ぶんをまとめた商品なので、1体の支出として数えると偏る)
const AVATAR_MULTI_MARKERS = Object.freeze([
  "full pack",
  "fullpack",
  "full set",
  "フルパック",
  "フルセット",
  "全対応",
  "全アバター",
  "複数アバター",
  "多対応",
  "複数対応",
]);
