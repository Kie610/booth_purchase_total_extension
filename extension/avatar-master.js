"use strict";

// D14 沼レポート(アバター別支出内訳)の素体名辞書。
//
// **ここはデータだけのファイル。照合の規則は common.js にある。**
// 素体は次々に増えるので、コードを変えずにこの配列へ1行足すだけで対応できる形にしてある。
//
// key      … 保存する識別子。手動割り当ての保存値にもなるので **後から変えない**
//            (変えると、保存済みの割り当てがどの素体を指すのか分からなくなる)
// name     … 画面に出す名前
// aliases  … 商品名・バリエーション名に現れうる表記。日本語表記とローマ字表記の両方を書く
//
// 照合の注意(common.js の avatarAliasMatches):
// - 英数字だけの別名は語の切れ目で照合する("Eku" が "Nekura" に当たらない)
// - それ以外(日本語)は単純な部分一致。短い語ほど誤検出しやすいので、
//   1文字だけの別名は原則入れない。誤りは画面の手動割り当てで上書きできる
const AVATAR_MASTER = Object.freeze([
  { key: "manuka", name: "マヌカ", aliases: ["マヌカ", "Manuka"] },
  { key: "shinra", name: "森羅", aliases: ["森羅", "Shinra"] },
  { key: "shinano", name: "しなの", aliases: ["しなの", "シナノ", "Shinano"] },
  { key: "selestia", name: "セレスティア", aliases: ["セレスティア", "Selestia"] },
  { key: "milfy", name: "ミルフィ", aliases: ["ミルフィ", "Milfy"] },
  { key: "eku", name: "エク", aliases: ["エク", "Eku"] },
  { key: "kikyo", name: "桔梗", aliases: ["桔梗", "Kikyo", "Kikyou"] },
  { key: "lime", name: "ライム", aliases: ["ライム", "Lime"] },
  { key: "mizuki", name: "瑞希", aliases: ["瑞希", "Mizuki"] },
  { key: "rurune", name: "ルルネ", aliases: ["ルルネ", "rurune"] },
  { key: "milltina", name: "ミルティナ", aliases: ["ミルティナ", "Milltina", "Miltina"] },
  { key: "sio", name: "しお", aliases: ["しおちゃん", "Sio"] },
  { key: "moe", name: "萌", aliases: ["萌", "Moe"] },
  { key: "hakka", name: "薄荷", aliases: ["薄荷", "Hakka"] },
  { key: "karin", name: "カリン", aliases: ["カリン", "Karin"] },
  { key: "chise", name: "チセ", aliases: ["チセ", "Chise"] },
  { key: "minamo", name: "みなも", aliases: ["みなも", "Minamo"] },
  { key: "maya", name: "舞夜", aliases: ["舞夜", "Maya"] },
  { key: "rindo", name: "竜胆", aliases: ["竜胆", "Rindo", "Rindou"] },
  { key: "shizuku", name: "しずく", aliases: ["しずく", "Shizuku"] },
  { key: "izayoi", name: "十六夜", aliases: ["十六夜", "Izayoi"] },
  { key: "kipfel", name: "キプフェル", aliases: ["キプフェル", "Kipfel"] },
  { key: "anon", name: "あのん", aliases: ["あのん", "Anon"] },
  { key: "yuko", name: "幽狐", aliases: ["幽狐", "Yuko", "Yuuko"] },
  { key: "grus", name: "グルス", aliases: ["グルス", "Grus"] },
  { key: "airi", name: "愛莉", aliases: ["愛莉", "Airi"] },
  { key: "mao", name: "真央", aliases: ["真央", "Mao"] },
  { key: "kokoa", name: "ここあ", aliases: ["ここあ", "Kokoa"] },
  { key: "leefa", name: "リーファ", aliases: ["リーファ", "Leefa"] },
  { key: "imeris", name: "イメリス", aliases: ["イメリス", "Imeris"] },
  { key: "sacchi", name: "サッチ", aliases: ["サッチ", "Sacchi"] },
  { key: "ruruka", name: "ルルカ", aliases: ["ルルカ", "Ruruka"] },
  { key: "lapwing", name: "ラプウィング", aliases: ["ラプウィング", "Lapwing"] },
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
  "多対応",
  "複数対応",
]);
