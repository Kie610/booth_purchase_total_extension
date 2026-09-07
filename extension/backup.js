"use strict";

// 保存データの版変換、検証、併合。DOMやストレージへ触れず、原本を変更しない。
// appVersionはアプリの保存形式、versionはバックアップの外枠、cache[id].vは取得項目。
const BACKUP_FORMAT = "booth-purchase-report";
const BACKUP_VERSION = 1;

function buildBackup(index, cache, exportedAt, avatarAssign, giftStatus, migrationConflicts) {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion: DATA_VERSION,
    exportedAt: (exportedAt || new Date()).toISOString(),
    index: index || null, cache: cache || {}, avatarAssign: avatarAssign || {},
    giftStatus: giftStatus || {},
    ...(migrationConflicts && Object.keys(migrationConflicts).length ? { migrationConflicts } : {}),
  };
}

function backupFileName(date) {
  const d = date || new Date();
  const stamp = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  return `booth-backup-${DATA_VERSION}-${stamp}.json`;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFiniteNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
function validBackupOrder(order) {
  return isObject(order) && typeof order.id === "string" && order.id.length > 0 &&
    typeof order.status === "string" && typeof order.date === "string" &&
    (order.importedAlternatives === undefined || Array.isArray(order.importedAlternatives));
}
function validBackupItem(item) {
  return isObject(item) && typeof item.shop === "string" &&
    (item.shopUrl === undefined || typeof item.shopUrl === "string") &&
    typeof item.name === "string" && isFiniteNumberOrNull(item.price) &&
    (item.quantity === undefined || item.quantity === null ||
      (Number.isInteger(item.quantity) && item.quantity >= 0)) &&
    (item.boost === undefined || isFiniteNumberOrNull(item.boost)) &&
    typeof item.gift === "boolean" &&
    (item.giftId == null || (typeof item.giftId === "string" && GIFT_ID_PATTERN.test(item.giftId)));
}
function validBackupCacheEntry(entry) {
  return isObject(entry) && isFiniteNumberOrNull(entry.amount) &&
    (entry.v === undefined || (Number.isInteger(entry.v) && entry.v >= 0)) &&
    (entry.gift === undefined || isFiniteNumberOrNull(entry.gift)) &&
    (entry.shipping === undefined || isFiniteNumberOrNull(entry.shipping)) &&
    (entry.status === undefined || typeof entry.status === "string") &&
    (entry.date === undefined || typeof entry.date === "string") &&
    (entry.partialItems === undefined || typeof entry.partialItems === "boolean") &&
    (entry.collectionFailed === undefined || typeof entry.collectionFailed === "boolean") &&
    (entry.csvFacts === undefined || Array.isArray(entry.csvFacts)) &&
    (entry.importedAlternatives === undefined || Array.isArray(entry.importedAlternatives)) &&
    (entry.items == null || (Array.isArray(entry.items) && entry.items.every(validBackupItem)));
}

// 変換は必ず隣接する版を返す。形が同じでも明示しておき、経路がない版は受理しない。
// 無版の1.0/1.1は構造上区別できないため、互換経路の始点から通す。
const DATA_MIGRATIONS = {
  "1.0.0": (data) => ({ ...data, avatarAssign: data.avatarAssign === undefined ? {} : data.avatarAssign, appVersion: "1.1.0" }),
  "1.1.0": (data) => ({ ...data, giftStatus: data.giftStatus === undefined ? {} : data.giftStatus, appVersion: "1.2.0" }),
};
function fileDataVersion(fileName) {
  return /-(?:v)?(\d+\.\d+\.\d+)-\d{8}\.(?:json|csv)$/i.exec(fileName || "")?.[1] || null;
}
function validateDataVersion(contentVersion, fileName) {
  const named = fileDataVersion(fileName);
  if (contentVersion != null && (typeof contentVersion !== "string" ||
      (contentVersion !== DATA_VERSION && !Object.hasOwn(DATA_MIGRATIONS, contentVersion)))) {
    throw new Error(`このデータのアプリ版(${String(contentVersion)})には変換経路がありません。`);
  }
  if (named && contentVersion && named !== contentVersion) {
    throw new Error("ファイル名と内容のアプリ版が一致しません。");
  }
  const version = contentVersion || named || "1.0.0";
  if (version !== DATA_VERSION && !Object.hasOwn(DATA_MIGRATIONS, version)) {
    throw new Error(`このデータのアプリ版(${version})には変換経路がありません。`);
  }
  return version;
}

// 通常の辞書へ展開するキーを信頼境界で拒否する。保存した付加情報にも同じ検証を通す。
function parseDataJson(text) {
  return JSON.parse(text, (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new Error("保存できないキーを含むデータです。");
    }
    return value;
  });
}

function parseBackup(text, fileName = "") {
  try {
    let data = parseDataJson(text);
    if (!isObject(data)) throw new Error("バックアップの形式ではありません。");
    // ブラウザ内の旧キーも同じ変換を通す。テーマや実行ロックは移行対象にしない。
    if (data.format === undefined && (Object.hasOwn(data, CACHE_KEY) || Object.hasOwn(data, INDEX_KEY))) {
      data = {
        format: BACKUP_FORMAT, version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(), appVersion: data[DATA_VERSION_KEY],
        index: data[INDEX_KEY] ?? null, cache: data[CACHE_KEY] ?? {},
        avatarAssign: data[AVATAR_ASSIGN_KEY] ?? {}, giftStatus: data[GIFT_STATUS_KEY] ?? {},
        migrationConflicts: data[MIGRATION_CONFLICTS_KEY] ?? {},
      };
    }
    if (data.format !== BACKUP_FORMAT) throw new Error("このファイルはBOOTHお買いものレポートのバックアップではありません。");
    if (data.version !== BACKUP_VERSION) throw new Error(`このバックアップのバージョン(${String(data.version)})には対応していません。`);
    const sourceVersion = validateDataVersion(data.appVersion, fileName);
    const warnings = [];
    if (!data.appVersion && !fileDataVersion(fileName)) {
      warnings.push("アプリ版の記録がないため、旧形式の互換経路で読み込みました。");
    }
    data.appVersion = sourceVersion;
    const visited = new Set();
    while (data.appVersion !== DATA_VERSION) {
      if (visited.has(data.appVersion) || !Object.hasOwn(DATA_MIGRATIONS, data.appVersion)) {
        throw new Error("最新版までの変換経路がありません。");
      }
      visited.add(data.appVersion);
      data = DATA_MIGRATIONS[data.appVersion](data);
    }
    if (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt))) {
      throw new Error("バックアップの書き出し日時が壊れています。");
    }
    if (data.index !== null && (!isObject(data.index) || !Array.isArray(data.index.orders) ||
        !data.index.orders.every(validBackupOrder) ||
        (data.index.updatedAt !== undefined && typeof data.index.updatedAt !== "string") ||
        (data.index.complete !== undefined && typeof data.index.complete !== "boolean"))) {
      throw new Error("バックアップの注文履歴が壊れています。");
    }
    if (!isObject(data.cache) || !Object.values(data.cache).every(validBackupCacheEntry)) {
      throw new Error("バックアップの金額データが壊れています。");
    }
    if (data.avatarAssign !== undefined && (!isObject(data.avatarAssign) ||
        !Object.values(data.avatarAssign).every((v) => typeof v === "string"))) {
      throw new Error("バックアップのアバター割り当てが壊れています。");
    }
    if (data.giftStatus !== undefined && (!isObject(data.giftStatus) ||
        Object.entries(data.giftStatus).some(([id, entry]) =>
          !GIFT_ID_PATTERN.test(id) || !isObject(entry) ||
          !["received", "unreceived"].includes(entry.state) ||
          ["issuedAt", "receivedAt", "memo"].some((k) => entry[k] != null && typeof entry[k] !== "string") ||
          (entry.checkedAt != null && typeof entry.checkedAt !== "string" &&
            !(typeof entry.checkedAt === "number" && Number.isFinite(entry.checkedAt)))))) {
      throw new Error("バックアップのギフト受取状況が壊れています。");
    }
    if (data.migrationConflicts !== undefined && (!isObject(data.migrationConflicts) ||
        Object.values(data.migrationConflicts).some((entries) => !isObject(entries) ||
          Object.values(entries).some((values) => !Array.isArray(values))))) {
      throw new Error("バックアップの併合時の相違データが壊れています。");
    }
    const giftStatus = {};
    for (const [id, value] of Object.entries(data.giftStatus || {})) {
      const key = id.toLowerCase();
      if (giftStatus[key] && JSON.stringify(giftStatus[key]) !== JSON.stringify(value)) {
        throw new Error("同じギフトIDに異なる受取状況が記録されています。");
      }
      giftStatus[key] = value;
    }
    for (const entry of Object.values(data.cache)) {
      for (const item of entry.items || []) if (item.giftId) item.giftId = item.giftId.toLowerCase();
    }
    return { ok: true, index: data.index, cache: data.cache, avatarAssign: data.avatarAssign || {},
      giftStatus, migrationConflicts: data.migrationConflicts || {}, exportedAt: data.exportedAt,
      appVersion: DATA_VERSION, sourceVersion, warnings };
  } catch (error) {
    return { ok: false, message: error instanceof SyntaxError ?
      "ファイルを読み取れませんでした(JSONとして解釈できません)。" : error.message };
  }
}

// 同一CSVの再取り込みでは増やさず、元から同一内容が複数行ある場合はその個数を残す。
function mergeOccurrences(current = [], incoming = []) {
  const merged = [...current];
  const counts = new Map();
  for (const value of current) {
    const key = JSON.stringify(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const value of incoming) {
    const key = JSON.stringify(value);
    if (counts.get(key)) counts.set(key, counts.get(key) - 1);
    else merged.push(value);
  }
  return merged;
}

function fillKnown(current, incoming) {
  const merged = { ...incoming, ...current };
  for (const key of Object.keys(merged)) {
    if (current[key] == null || current[key] === "") merged[key] = incoming[key] ?? current[key];
  }
  return merged;
}
function conflictsWith(current, incoming) {
  return Object.entries(incoming).some(([key, value]) => value != null && value !== "" &&
    current[key] != null && current[key] !== "" && JSON.stringify(current[key]) !== JSON.stringify(value));
}

// 主値は既存の既知情報。欠落を補い、異なる既知値は原形のまま保管して集計へ混ぜない。
function mergeCacheEntry(current, incoming) {
  if (!current) return incoming;
  if (!incoming) return current;
  const merged = fillKnown(current, incoming);
  const sameItem = (a, b) => a.name === b.name && a.gift === b.gift &&
    (a.shopUrl && b.shopUrl ? a.shopUrl === b.shopUrl : a.shop === b.shop) &&
    (!a.giftId || !b.giftId || a.giftId === b.giftId);
  if (Array.isArray(current.items) && Array.isArray(incoming.items)) {
    const primary = current.partialItems && !incoming.partialItems ? incoming : current;
    const secondary = primary === current ? incoming : current;
    const remaining = [...secondary.items];
    merged.items = [...primary.items];
    // ponytail: 注文内の明細だけをO(n²)で照合する。巨大な単一注文が実測で問題になれば索引化する。
    // 既知項目の多い明細を先に対応させ、不明な価格へ同名の別商品の額を埋めない。
    const specificity = (item) => Object.values(item).filter((value) => value != null && value !== "").length;
    const slots = primary.items.map((item, i) => ({ item, i }))
      .sort((a, b) => specificity(b.item) - specificity(a.item));
    for (const { item, i } of slots) {
      const candidates = remaining.filter((other) => sameItem(item, other) && !conflictsWith(item, other));
      if (!candidates.length || candidates.some((other) => JSON.stringify(other) !== JSON.stringify(candidates[0]))) continue;
      const other = remaining.splice(remaining.indexOf(candidates[0]), 1)[0];
      merged.items[i] = primary === current ? fillKnown(item, other) : fillKnown(other, item);
    }
    if (primary.partialItems && secondary.partialItems) {
      // 同一商品の行数が違う場合は代替情報へ残す。追加購入か別の部分出力かを推測しない。
      merged.items.push(...remaining.filter((item) => !primary.items.some((other) => sameItem(item, other))));
    }
    if (current.partialItems !== undefined || incoming.partialItems !== undefined) {
      merged.partialItems = Boolean(primary.partialItems);
    }
    if (primary.v === undefined) delete merged.v;
    else merged.v = primary.v;
  } else if (!Array.isArray(current.items) && Array.isArray(incoming.items)) {
    merged.items = incoming.items;
    if (incoming.partialItems === undefined) delete merged.partialItems;
    else merged.partialItems = incoming.partialItems;
    if (incoming.v === undefined) delete merged.v;
    else merged.v = incoming.v;
  }
  if (current.csvFacts || incoming.csvFacts) merged.csvFacts = mergeOccurrences(current.csvFacts, incoming.csvFacts);
  if (merged.collectionFailed && (!needsCollect(current) || !needsCollect(incoming))) {
    merged.collectionFailed = false;
  }
  const alternatives = mergeOccurrences(current.importedAlternatives, incoming.importedAlternatives);
  // 完全な明細を採用するときも、部分明細にしかない値があれば両側の原形を残す。
  for (const source of [current, incoming]) {
    const { csvFacts: _facts, importedAlternatives: _alts, ...values } = source;
    const { v: _v, partialItems: _partial, collectionFailed: _failed, ...comparable } = values;
    if (conflictsWith(merged, comparable) && !alternatives.some((x) => JSON.stringify(x) === JSON.stringify(values))) {
      alternatives.push(values);
    }
  }
  if (alternatives.length) merged.importedAlternatives = alternatives;
  return merged;
}
function mergeOrderCache(current, incoming) {
  const merged = { ...current };
  for (const [id, entry] of Object.entries(incoming || {})) merged[id] = mergeCacheEntry(current[id], entry);
  return merged;
}
function mergeOrderIndex(current, incoming, updatedAt) {
  if (!current && !incoming) return null;
  const orders = new Map();
  for (const order of [...(current?.orders || []), ...(incoming?.orders || [])]) {
    const previous = orders.get(order.id);
    if (!previous) orders.set(order.id, order);
    else {
      const merged = fillKnown(previous, order);
      const { importedAlternatives: _alts, ...values } = order;
      const alternatives = mergeOccurrences(previous.importedAlternatives, order.importedAlternatives);
      if (conflictsWith(merged, values) && !alternatives.some((x) => JSON.stringify(x) === JSON.stringify(values))) alternatives.push(values);
      if (alternatives.length) merged.importedAlternatives = alternatives;
      orders.set(order.id, merged);
    }
  }
  // 空の移行先への復元は索引の日時と完全性をそのまま維持する。
  const primary = current || incoming;
  return { ...incoming, ...primary, orders: [...orders.values()],
    ...(current && incoming ? { updatedAt: (updatedAt || new Date()).toISOString(),
      complete: indexIsComplete(current) && indexIsComplete(incoming) } : {}) };
}
function mergeAvatarAssign(current, incoming) {
  return { ...incoming, ...current };
}
function mergeBackup(current, incoming, updatedAt) {
  const index = mergeOrderIndex(current.index, incoming.index, updatedAt);
  const cache = mergeOrderCache(current.cache || {}, incoming.cache || {});
  const avatarAssign = mergeAvatarAssign(current.avatarAssign || {}, incoming.avatarAssign || {});
  const giftStatus = { ...incoming.giftStatus, ...current.giftStatus };
  const migrationConflicts = {};
  for (const kind of new Set([...Object.keys(current.migrationConflicts || {}),
      ...Object.keys(incoming.migrationConflicts || {}), "avatarAssign", "giftStatus"])) {
    const entries = { ...current.migrationConflicts?.[kind] };
    for (const [key, values] of Object.entries(incoming.migrationConflicts?.[kind] || {})) {
      entries[key] = mergeOccurrences(entries[key], values);
    }
    for (const [key, value] of Object.entries(incoming[kind] || {})) {
      if (current[kind]?.[key] !== undefined && JSON.stringify(current[kind][key]) !== JSON.stringify(value)) {
        entries[key] = mergeOccurrences(entries[key], [value]);
      }
    }
    if (Object.keys(entries).length) migrationConflicts[kind] = entries;
  }
  return { index, cache, avatarAssign, giftStatus, migrationConflicts, appVersion: DATA_VERSION,
    addedOrders: (index?.orders.length || 0) - new Set((current.index?.orders || []).map((o) => o.id)).size,
    addedAmounts: Object.values(cache).filter((e) => !needsCollect(e)).length -
      Object.values(current.cache || {}).filter((e) => !needsCollect(e)).length,
    addedAssign: Object.keys(avatarAssign).length - Object.keys(current.avatarAssign || {}).length };
}
