// 拡張API のスタブ(テスト用)
var browser = {
  storage: {
    local: {
      _data: {},
      _getCalls: [],
      get(keys) {
        this._getCalls.push(keys);
        const r = {};
        for (const k of [].concat(keys)) if (k in this._data) r[k] = this._data[k];
        return Promise.resolve(r);
      },
      set(obj) { Object.assign(this._data, obj); return Promise.resolve(); },
      remove(k) { delete this._data[k]; return Promise.resolve(); },
    },
    onChanged: { addListener() {} },
  },
  tabs: {
    getCurrent: () => Promise.reject(new Error("no tab")),
    get: () => Promise.reject(new Error("no tab")),
    create: () => Promise.resolve({ id: 1 }),
    update: () => Promise.resolve(),
  },
  windows: { update: () => Promise.resolve() },
  // 受取状況の確認で booth.pm の許可を求める。テストでは常に許可されたことにする
  permissions: {
    _requested: [],
    request(p) { this._requested.push(p); return Promise.resolve(true); },
    contains: () => Promise.resolve(true),
  },
  runtime: { getURL: (p) => "chrome-extension://test/" + p },
};
