// 拡張API のスタブ(テスト用)
var browser = {
  storage: {
    local: {
      _data: {},
      get(keys) {
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
  runtime: { getURL: (p) => "chrome-extension://test/" + p },
};
