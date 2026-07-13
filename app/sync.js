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

export function gasTransport(pair, fetchFn = fetch) {
  return {
    async pull(since) {
      const res = await fetchFn(`${pair.url}?action=pull&since=${since}&token=${encodeURIComponent(pair.token)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    async push(ops) {
      const res = await fetchFn(pair.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: pair.token, ops }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  };
}

const keyFieldOf = tab => (tab === 'settings' ? 'key' : 'id');

export class SyncEngine {
  constructor({ transport, storage, onChange = () => {}, onStatus = () => {}, pollMs = 20000 }) {
    this.transport = transport;
    this.storage = storage;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.pollMs = pollMs;
    this.data = { itinerary: {}, expenses: {}, settings: {}, phrases: [] };
    this.queue = [];        // 待送 ops
    this.inFlight = [];     // 送出中 ops（失敗會放回 queue 前端）
    this.lastSync = 0;
    this.attempt = 0;
    this.flushing = false;
    this.retryPending = false;
    this.online = true;
    this.timer = null;
    this.retryTimer = null;
    this.load_();
  }
  load_() {
    try { const d = JSON.parse(this.storage.getItem(LS.data)); if (d) this.data = d; } catch (_) {}
    try { const q = JSON.parse(this.storage.getItem(LS.queue)); if (Array.isArray(q)) this.queue = q; } catch (_) {}
    this.lastSync = Number(this.storage.getItem(LS.lastSync) || 0);
  }
  save_() {
    this.storage.setItem(LS.data, JSON.stringify(this.data));
    this.storage.setItem(LS.queue, JSON.stringify(this.inFlight.concat(this.queue)));
    this.storage.setItem(LS.lastSync, String(this.lastSync));
  }
  pendingKeys_(tab) {
    const kf = keyFieldOf(tab);
    const s = new Set();
    for (const op of this.inFlight.concat(this.queue)) if (op.tab === tab) s.add(op.record[kf]);
    return s;
  }
  pendingCount() { return this.inFlight.length + this.queue.length; }
  opKey_(op) { return op.tab + ' ' + op.record[keyFieldOf(op.tab)]; }
  status_(extra) {
    this.onStatus(Object.assign({ online: this.online, pending: this.pendingCount(), flushing: this.flushing }, extra));
  }
  /* 樂觀更新：立即改本地、去重排隊、觸發背景 flush */
  upsert(tab, record) {
    const kf = keyFieldOf(tab);
    const k = record[kf];
    this.data[tab] = { ...this.data[tab], [k]: record };
    this.queue = this.queue.filter(op => !(op.tab === tab && op.record[kf] === k));
    this.queue.push({ tab, record });
    this.save_();
    this.onChange();
    this.status_();
    this.flush();
  }
  async flush(force = false) {
    if (this.flushing) return;
    if (this.retryPending && !force) return; // 退避期間不重送（手動同步例外）
    if (this.queue.length === 0) return;
    if (force) { clearTimeout(this.retryTimer); this.retryPending = false; }
    this.flushing = true;
    this.status_();
    try {
      while (this.queue.length > 0) {
        this.inFlight = this.queue.splice(0, 50);
        try {
          await this.transport.push(this.inFlight);
          this.inFlight = [];
          this.attempt = 0;
          this.online = true;
          this.save_();
        } catch (err) {
          // 送出期間若同 (tab,key) 已有更新版本進佇列，丟棄過時的 inFlight op
          const superseded = new Set(this.queue.map(op => this.opKey_(op)));
          this.queue = this.inFlight.filter(op => !superseded.has(this.opKey_(op))).concat(this.queue);
          this.inFlight = [];
          this.online = false;
          this.attempt += 1;
          const delay = Math.min(1000 * Math.pow(4, this.attempt - 1), 16000); // 1s/4s/16s
          clearTimeout(this.retryTimer);
          this.retryPending = true;
          this.retryTimer = setTimeout(() => { this.retryPending = false; this.flush(); }, delay);
          if (String(err.message) === 'unauthorized') this.status_({ unauthorized: true });
          break;
        }
      }
    } finally {
      this.flushing = false;
      this.save_();
      this.status_();
    }
  }
  async pull() {
    try {
      const resp = await this.transport.pull(this.lastSync);
      this.online = true;
      for (const tab of ['itinerary', 'expenses']) {
        this.data[tab] = mergeServerRecords(this.data[tab], resp[tab], this.pendingKeys_(tab), 'id');
      }
      const settingsRecs = Object.entries(resp.settings || {}).map(([key, value]) => ({ key, value }));
      this.data.settings = mergeServerRecords(this.data.settings, settingsRecs, this.pendingKeys_('settings'), 'key');
      if (Array.isArray(resp.phrases) && resp.phrases.length > 0) this.data.phrases = resp.phrases;
      this.lastSync = Number(resp.serverTime || this.lastSync);
      this.save_();
      this.onChange();
    } catch (err) {
      this.online = false;
      if (String(err.message) === 'unauthorized') { this.status_({ unauthorized: true }); return; }
    }
    this.status_();
  }
  async syncNow() { await this.flush(true); await this.pull(); }
  start(doc = (typeof document === 'undefined' ? null : document)) {
    this.syncNow();
    this.timer = setInterval(() => {
      if (!doc || doc.visibilityState === 'visible') this.syncNow();
    }, this.pollMs);
    if (doc) doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') this.syncNow();
    });
  }
}
