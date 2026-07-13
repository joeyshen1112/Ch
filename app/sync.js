/* app/sync.js — 本地優先資料層：localStorage 快取＋離線佇列＋GAS 輪詢 */

export const LS = { data: 'tt.data', queue: 'tt.queue', lastSync: 'tt.lastSync', pair: 'tt.pair', tab: 'tt.tab' };

export function encodePairCode(url, token) { return btoa(JSON.stringify({ url, token })); }

export function decodePairCode(code) {
  try {
    const o = JSON.parse(atob(String(code).trim()));
    if (typeof o.url === 'string' && o.url.startsWith('https://') &&
        typeof o.token === 'string' && o.token.length > 0) {
      return { url: o.url, token: o.token };
    }
  } catch (_) { /* 非法輸入 */ }
  return null;
}

export function memStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

/* record 級 last-write-wins；pendingKeys（尚未送出的本地變更）優先 */
export function mergeServerRecords(local, serverRecords, pendingKeys, keyField = 'id') {
  const out = { ...local };
  for (const rec of serverRecords || []) {
    const k = rec[keyField];
    if (k === undefined || k === '') continue;
    if (pendingKeys.has(k)) continue;
    const cur = out[k];
    if (!cur || Number(rec.updatedAt || 0) >= Number(cur.updatedAt || 0)) out[k] = rec;
  }
  return out;
}
