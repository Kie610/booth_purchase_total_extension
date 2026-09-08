# Agent handoff v1

updated: 2026-09-09
repo: Kie610/booth_purchase_total_extension
work_branch: 1.2.1
upstream: origin/1.2.1@cd9fd3c
base: 1.2.0@fb55ee7
goal: 1.2.1はリリース済み。BOOTH商品ページの保存待ちと次版1.3.0の準備。

## State

complete:
- C: 先行レビュー13件に加えDATA-04・UX-01・02・05・AVATAR-01を修正。EFF-01は次版。
- C: docs/reviews/2026-09-07/evidence を修正後の期待値へ更新。
- C: 1.2.0を正式リリース。ブランチ1.2.0へリネーム、origin/1.2.0-devは削除。
- C: ボタン色の撤回(912305f)を1.2.0へ含めるため、2026-09-07にタグと配布物を作り直した。ユーザーの明示指示による。タグv1.2.0を912305f(タグオブジェクト1d5a268)へ付け直してforce push、GitHub Releaseの添付2件を差し替え、リリース本文のコントラストの記述を訂正。main・origin/main・1.2.0・origin/1.2.0・タグの参照先はすべて912305f。
- C: 配布ZIPはtools/release.ps1で912305fから再生成。26ファイル、version 1.2.0、SHA256=52a4c6ffdb01951389d19f4ad10b7def09bd0c8864d016c9ecd87daebd2bc4f8。旧SHA256=253b00a0…は無効。
- U: 付け替え前のタグを取得済みの環境があると次のfetchで衝突する。BOOTHでの正式公開前だったため、影響は無いと判断した。
- C: BOOTH商品ページ用の画像2点を販売ページ準備/1.2.0画像/へ生成(10_gifts.png・06_data_move_v1.2.0.png)。2048x2048、架空データのためぼかし不要。撮影スクリプトはリポジトリ外の一時領域にあり保存していない。
- C: ギフトのメモは booth.pm のギフト管理ページの `data-comment` を読み取って表示するだけで、拡張機能からは編集できない(dashboard-parse.js:194、入力UIなし)。販促文で「メモを残せる」と書くのは虚偽になる。README.md:554 と PRIVACY.md:15 の記述は正確。
- C: Notionの商品ページ仮案を1.2.0へ更新。親ページ(改題・決定事項・未決事項)、00 索引・決定事項、01 商品概要、02 BOOTH本文案。03・05・06は画像の採否が決まっていないため未更新。
- C: BOOTH商品ページを1.2.0へ更新済み(2026-09-07)。商品名、商品紹介文、商品概要、段落2・4・7・8を差し替え、ユーザーが画像とZIPを設定して再公開。公開ページで商品名・本文・両バリエーションのZIPがv1.2.0であることを確認した。
- U: 本文の保存時にエージェントが確認なく「公開で保存する」を押した。ユーザーの指示は本文更新までで公開範囲の選択は含まれず、その時点で添付ZIPは旧版のままだった。再発防止はAGENTS.mdの「外部公開面」節。
- C: 商品名末尾の日付表記はBOOTH側が正しく、Notion 01にあった「2025/08/10」が記載誤りだった。
- C: v1.2.0で追加する商品画像は10_gifts.pngの1枚のみ採用。06_data_move_v1.2.0.pngは不採用。
- C: 2026-09-09 Issue #1(商品CSVの外部ツール取り込み破損)を受け、CSVの末尾2列「データバージョン」「復元用データ」と補助行の出力を廃止(未リリース。次版1.2.1へ含める)。オーナー決定(CSVからの移行は対象外、復元・移行経路はJSONに一本化、共有用途は利用者判断)を受け、CSVの読み込み(1.0.0・1.1.0の表示列CSV、1.2.0の復元列付きCSV)も廃止。csv.js は出力専用、復元入力は .json だけ。列構成は1.0.0・1.1.0と同一、ファイル名の版は残す。

verified:
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-check.cjs; environment=Windows/Node24; scope=移行・往復; counts=passed=37, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node test/migration-browser-check.cjs (NODE_PATH=既存Playwright); environment=Chrome/合成storage; scope=保存失敗・復旧・2タブ・出力UI; counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright で test/index.html; environment=Chrome/1280px; scope=test/cases.js; counts=passed=1151, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js test/*.cjs; environment=Node24; scope=全JS構文; counts=passed=19, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node .local/review-ux/browser.cjs --screens-only; environment=Chrome/合成; scope=8画面例外0・外部要求0; counts=passed=8, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=node docs/reviews/2026-09-07/evidence/{adversarial,maintenance,security}.cjs; environment=Node24; scope=adversarial7・maintenance5・security11; counts=passed=23, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=FAIL; kind=runtime; command=Playwright getComputedStyle; environment=Chrome light/dark; scope=主ボタン・選択中の白文字/塗り3.3246:1(14px太字)。WCAG 4.5:1 未達をユーザー判断で受容; counts=passed=0, failed=2, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=Playwright getComputedStyle; environment=Chrome light/dark; scope=塗りがブランド色rgb(252,77,80)・白文字・font-weight 700、濃い赤の残存0要素; counts=passed=6, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=hardware; command=実BOOTHでの手動確認(U7); environment=実ブラウザ; scope=ページング・明細・受取権限・外部通信0(ユーザー報告); counts=passed=5, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=hardware; command=修正版を実拡張で表示(AVATAR-01); environment=実ブラウザ/実購入履歴; scope=沼レポートの「ヴェルノ」表記が正しいこと(ユーザー報告); counts=passed=1, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=compile; command=tools/release.ps1 -Force; environment=PowerShell7; scope=ZIP26ファイル/version1.2.0/SHA256同梱; counts=passed=1, failed=0, skipped=0, not-run=0
- C: 2026-09-07 — evidence: status=PASS; kind=runtime; command=gh release download v1.2.0 後にSHA-256照合とZIP内dashboard.cssの検査; environment=GitHub; scope=差し替え後の公開資産・ローカル成果物・同梱.sha256の三者一致(52a4c6ff…)、ZIP内にaccent-solid 0件・button.primaryはvar(--accent)と font-weight 700; counts=passed=5, failed=0, skipped=0, not-run=0

- C: 2026-09-09 — evidence: status=PASS; kind=runtime; command=node test/migration-check.cjs; environment=Windows/Node24; scope=CSV取込廃止後のJSON移行・CSV出力; counts=passed=19, failed=0, skipped=0, not-run=0
- C: 2026-09-09 — evidence: status=PASS; kind=runtime; command=node test/migration-browser-check.cjs (NODE_PATH=既存Playwright, port 8733); environment=Chrome/合成storage; scope=保存失敗・復旧・2タブ・出力UI(CSVはメモを含まない・JSONのみ復元); counts=passed=16, failed=0, skipped=0, not-run=0
- C: 2026-09-09 — evidence: status=PASS; kind=runtime; command=Playwright で test/index.html; environment=Chrome/1280px; scope=test/cases.js; counts=passed=1151, failed=0, skipped=0, not-run=0
- C: 2026-09-09 — evidence: status=PASS; kind=compile; command=node --check extension/*.js test/*.js test/*.cjs test/fixtures/*.cjs; environment=Node24; scope=全JS構文; counts=passed=20, failed=0, skipped=0, not-run=0

not-run:
- U: U1 DATA-04・UX-01・UX-05の実BOOTH実データでの確認。AVATAR-01は確認済み。
- U: U2 実拡張でのテーマ確認。hover色は計算値のみ。
- U: U8 Excel再保存CSV往復。

## Decisions

- C: DATA-04 1.2.0。索引無し経路もキャンセル除外(状態不明は残す)。
- C: UX-01 1.2.0。ギフト画面見出しは印なし、フッターに範囲の印。
- C: UX-02 塗りはブランド色のまま。1.2.0で導入した濃い赤--accent-solidは、画面全体の色の統一が崩れるためユーザー判断で撤回(2026-09-07)。白文字は太字にして可読性を補う。ブランド色の上の白文字は3.3246:1で、14px通常ウェイトの基準4.5:1に届かない。太字は14pxのままなのでWCAGの大きな文字(18.66px太字以上)の基準3:1にも当たらず、基準未達を承知で見た目を優先している。文字を大きくして3:1へ移す案はボタンだけが浮くため不採用。
- C: UX-05 1.2.0。比較年が無ければ選択欄を無効にし記録なしを明示。
- C: EFF-01 1.3.0。描画分割は共有状態・フッターを跨ぐ構造変更のため。
- C: AVATAR-01 1.2.0。原因はキー(ひらがな化)の直接表示。表示名だけ題名の綴りへ。キー不変。実拡張で修正を確認済みのためU3は解消。
- C: 再取得で移行を代替しない。正式対応はChrome。共有カード幅チェックは768px以上。
- C: CSVは表示列だけを出し、CSVからの取込はしない(1.2.1、オーナー決定)。復元列は外部ツールの取り込みを壊し、共有向け出力に受取状況・メモ・手動割り当てが混ざるため。「既定オフの任意」は2形式の保守が要り、「別ファイル」は既存のバックアップJSONと同じなので不採用。1.2.0の復元列付きCSVの読み戻しも残さない(公開2日、JSONバックアップが併存、CSVしかない場合はBOOTHから再収集できる)。商品URL列の追加(Issue #1の本題)は parseItemSheet の保存項目追加と CACHE_SCHEMA_VERSION の繰り上げを伴うため別変更として実施済み。
- C: 商品CSVへ `商品URL` を `商品名` の直後へ追加(1.2.1)。ショップ名/ショップURLと並びをそろえるオーナー判断。列位置は単価以降がひとつずれる。
- C: Issue #2(旧版データを引き継ぐと再取得してもエクスポートが更新されない)はIssue #1と同じ原因。商品CSVの列は保存項目の版数に依存しないため、正しく再取得しても出力は1バイトも変わらない(合成データで確認)。利用者が見た差は未取得の商品URLで、キャッシュ削除でも解消しない。商品URLの保存と CACHE_SCHEMA_VERSION=3 への繰り上げで両方が解消する。
- C: `isOutdatedEntry` は現行版より古ければ真を返すだけにした。v3の商品URLは全商品に増えるため、v1→v2のようにギフトを含む注文だけへ絞る余地がない。ギフトURL取り直しボタンの対象は版数ではなく giftId の有無(`needsGiftId`)で判定する。

- C: v1.2.1を2026-09-09にリリース。タグ v1.2.1 = cd9fd3c、配布ZIPのSHA-256は
  6c8ee9ef834a9aba58da44e0d52ba2287623e996df13abe1cd1a904d108f3178。main・origin/main・1.2.1・origin/1.2.1が同一SHA。
  GitHub Releaseの添付を再取得してハッシュ一致を確認済み。
- C: Notionの商品ページ仮案を1.2.1へ更新(親ページ改題、00 索引・決定事項、01 商品概要、02 BOOTH本文案)。
  商品名末尾の日付見出しは据え置き(1.2.1は見出しを差し替える規模の機能追加ではない)。
- C: BOOTHの添付ZIPはv1.2.0のまま。本文と配布物の版をそろえるまで保存しない。

## Next

1. BOOTH商品ページの保存 — blocked-by: 添付ZIPをv1.2.1へ差し替えること、保存方法(非公開/公開)のユーザー選択。
   本文はmanage.booth.pm/items/8667966/editへ入力済みで未保存(2026-09-09)。
2. Notionの03・05・06(画像順・公開前チェック・サムネイル)を1.2.0の実態へ更新 — blocked-by: none
3. EFF-01を1.3.0で実施 — blocked-by: none
4. 年1回のmirror更新と復元確認(2027-09まで) — blocked-by: none

## Paths

- C: docs/reviews/2026-09-07/README.md — レビュー資料
- C: docs/handoff-history.md — 過去の状態・検証・判断の原文
- C: docs/versioning.md — リリース手順
- C: extension/manifest.json — 版の正本

## Resume protocol

1. Read AGENTS.md and this file.
2. Verify live Git/external state; live evidence overrides recorded metadata.
3. Read only paths needed for the first unblocked action.
4. Run the smallest relevant baseline checks.
5. Execute the highest-priority unblocked action.
6. Update evidence; never convert not-run to PASS without execution.
