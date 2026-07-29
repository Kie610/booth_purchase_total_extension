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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validBackupOrder(order) {
  return (
    isObject(order) &&
    typeof order.id === "string" &&
    order.id.length > 0 &&
    typeof order.status === "string" &&
    typeof order.date === "string"
  );
}

function validBackupItem(item) {
  return (
    isObject(item) &&
    typeof item.shop === "string" &&
    (item.shopUrl === undefined || typeof item.shopUrl === "string") &&
    typeof item.name === "string" &&
    isFiniteNumberOrNull(item.price) &&
    (item.quantity === undefined ||
      item.quantity === null ||
      (Number.isInteger(item.quantity) && item.quantity >= 0)) &&
    (item.boost === undefined || isFiniteNumberOrNull(item.boost)) &&
    typeof item.gift === "boolean"
  );
}

function validBackupCacheEntry(entry) {
  return (
    isObject(entry) &&
    isFiniteNumberOrNull(entry.amount) &&
    (entry.v === undefined || (Number.isInteger(entry.v) && entry.v >= 0)) &&
    (entry.gift === undefined || isFiniteNumberOrNull(entry.gift)) &&
    (entry.shipping === undefined || isFiniteNumberOrNull(entry.shipping)) &&
    (entry.status === undefined || typeof entry.status === "string") &&
    (entry.date === undefined || typeof entry.date === "string") &&
    (entry.items === undefined ||
      entry.items === null ||
      (Array.isArray(entry.items) && entry.items.every(validBackupItem)))
  );
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
  if (data.version !== BACKUP_VERSION) {
    return {
      ok: false,
      message: `このバックアップのバージョン(${String(data.version)})には対応していません。`,
    };
  }
  if (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt))) {
    return { ok: false, message: "バックアップの書き出し日時が壊れています。" };
  }
  if (data.index !== null) {
    if (
      !isObject(data.index) ||
      !Array.isArray(data.index.orders) ||
      !data.index.orders.every(validBackupOrder) ||
      (data.index.updatedAt !== undefined && typeof data.index.updatedAt !== "string") ||
      (data.index.complete !== undefined && typeof data.index.complete !== "boolean")
    ) {
      return { ok: false, message: "バックアップの注文履歴が壊れています。" };
    }
  }
  if (
    !isObject(data.cache) ||
    Object.values(data.cache).some((entry) => !validBackupCacheEntry(entry))
  ) {
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
