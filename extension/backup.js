"use strict";

// 収集したデータの書き出しと読み込み(引っ越し)。
// ストレージにもDOMにも触らない変換だけなので、そのままテストできる。
//
// 注文1000件の再収集には250ms間隔で4分以上かかる。ブラウザやプロファイルを
// 移すたびにやり直しになるのを避けるためのもので、人が読むためのCSVとは別物。

const BACKUP_FORMAT = "booth-purchase-report";
const BACKUP_VERSION = 1;

function buildBackup(index, cache, exportedAt) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: (exportedAt || new Date()).toISOString(),
    index: index || null,
    cache: cache || {},
  };
}

function backupFileName(date) {
  const d = date || new Date();
  const stamp =
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  return `booth-backup-${stamp}.json`;
}

// 読み込んだ内容をそのまま保存すると、壊れたデータでストレージを上書きしてしまう。
// 形が合っているかをここで確かめ、駄目なら理由を返す
function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: "ファイルを読み取れませんでした(JSONとして解釈できません)。" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "このファイルはバックアップの形式ではありません。" };
  }
  if (data.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      message: "このファイルはBOOTHお買いものレポートのバックアップではありません。",
    };
  }
  if (data.index !== null && data.index !== undefined) {
    if (typeof data.index !== "object" || !Array.isArray(data.index.orders)) {
      return { ok: false, message: "バックアップの注文履歴が壊れています。" };
    }
  }
  if (data.cache !== undefined && (typeof data.cache !== "object" || data.cache === null || Array.isArray(data.cache))) {
    return { ok: false, message: "バックアップの金額データが壊れています。" };
  }
  return {
    ok: true,
    index: data.index || null,
    cache: data.cache || {},
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
  };
}

// 入れ替えではなく併合する。移行先が空なら結果は同じで、既にデータがある環境へ
// 古いバックアップを読み込んだときに、今あるものを失わずに済む
function mergeOrderIndex(current, incoming, updatedAt) {
  if (!incoming) return current;
  if (!current) return incoming;
  const merged = new Map(incoming.orders.map((o) => [o.id, o]));
  // 同じ注文があれば今のものを残す(ステータスは変わりうるので新しい方を正とする)
  for (const order of current.orders) merged.set(order.id, order);
  return {
    updatedAt: (updatedAt || new Date()).toISOString(),
    orders: Array.from(merged.values()),
    // 片方でも未完了なら、つないだ結果に抜けが無いとは言い切れない。
    // 完全と記録すると、実際より少ない合計を正しい合計だと思わせてしまう
    complete: indexIsComplete(current) && indexIsComplete(incoming),
  };
}

// 収集済みの側を優先する。今あるものが未収集や明細なしのときだけ、読み込んだ側で埋める
function mergeOrderCache(current, incoming) {
  const merged = { ...incoming };
  for (const [id, entry] of Object.entries(current)) {
    if (!needsCollect(entry) || !merged[id] || needsCollect(merged[id])) {
      merged[id] = entry;
    }
  }
  return merged;
}

// 併合の結果と、それによって何件増えたか(画面に出して確かめられるようにする)
function mergeBackup(current, incoming, updatedAt) {
  const index = mergeOrderIndex(current.index, incoming.index, updatedAt);
  const cache = mergeOrderCache(current.cache, incoming.cache);
  const beforeOrders = current.index ? current.index.orders.length : 0;
  const beforeCollected = Object.values(current.cache).filter((e) => !needsCollect(e)).length;
  return {
    index,
    cache,
    addedOrders: (index ? index.orders.length : 0) - beforeOrders,
    addedAmounts:
      Object.values(cache).filter((e) => !needsCollect(e)).length - beforeCollected,
  };
}
