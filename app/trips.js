/* app/trips.js — 一支手機存多份行程（各自一組配對碼），切換時不清資料。
 * 清單只存在這支手機的 localStorage；別人沒有你的配對碼就看不到你那份。
 * 每份行程的快取／佇列／水位用 `<原 key>.<tripId>` 分開放，SyncEngine 透過 tripStorage() 無感使用。 */
import { LS } from './sync.js';

export const TRIPS_KEY = 'tt.trips';
export const CURRENT_KEY = 'tt.current';
const PER_TRIP = [LS.data, LS.queue, LS.lastSync];

/* 同一個後端網址就是同一份行程（換 TOKEN 不算新行程） */
export function tripIdOf(url) {
  let h = 5381;
  for (const c of String(url)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export function listTrips(storage) {
  try { const a = JSON.parse(storage.getItem(TRIPS_KEY)); return Array.isArray(a) ? a : []; }
  catch (_) { return []; }
}
const saveTrips = (storage, list) => storage.setItem(TRIPS_KEY, JSON.stringify(list));

export function currentTrip(storage) {
  const list = listTrips(storage);
  return list.find(t => t.id === storage.getItem(CURRENT_KEY)) || list[0] || null;
}

/* 舊版只有單一 tt.pair：第一次跑新版時把它和它的快取搬成清單裡的第一份 */
export function migrateLegacy(storage) {
  if (storage.getItem(TRIPS_KEY) !== null) return;
  let pair = null;
  try { pair = JSON.parse(storage.getItem(LS.pair)); } catch (_) {}
  if (!pair || !pair.url || !pair.token) { saveTrips(storage, []); return; }
  const id = tripIdOf(pair.url);
  for (const k of PER_TRIP) {
    const v = storage.getItem(k);
    if (v !== null) storage.setItem(`${k}.${id}`, v);
  }
  saveTrips(storage, [{ id, url: pair.url, token: pair.token }]);
  storage.setItem(CURRENT_KEY, id);
}

/* 新增（或更新 TOKEN）並切過去；不動其他行程的資料 */
export function addTrip(storage, pair) {
  const id = tripIdOf(pair.url);
  const list = listTrips(storage).filter(t => t.id !== id);
  list.push({ id, url: pair.url, token: pair.token });
  saveTrips(storage, list);
  storage.setItem(CURRENT_KEY, id);
  return id;
}

export function switchTrip(storage, id) {
  if (listTrips(storage).some(t => t.id === id)) storage.setItem(CURRENT_KEY, id);
}

/* 只從這支手機移除（雲端試算表不受影響） */
export function removeTrip(storage, id) {
  saveTrips(storage, listTrips(storage).filter(t => t.id !== id));
  for (const k of PER_TRIP) storage.removeItem(`${k}.${id}`);
  if (storage.getItem(CURRENT_KEY) === id) {
    const next = listTrips(storage)[0];
    if (next) storage.setItem(CURRENT_KEY, next.id); else storage.removeItem(CURRENT_KEY);
  }
}

/* 給 SyncEngine 用：同步相關的 key 自動加上行程 id，其他 key 照舊 */
export function tripStorage(storage, id) {
  const map = k => (PER_TRIP.includes(k) ? `${k}.${id}` : k);
  return {
    getItem: k => storage.getItem(map(k)),
    setItem: (k, v) => storage.setItem(map(k), v),
    removeItem: k => storage.removeItem(map(k)),
  };
}

/* 清單上顯示用：從該行程的快取讀名稱與日期（還沒同步過就用預設） */
export function tripLabel(storage, id) {
  let s = {};
  try { s = (JSON.parse(storage.getItem(`${LS.data}.${id}`)) || {}).settings || {}; } catch (_) {}
  const g = k => s[k] && s[k].value;
  const start = g('tripStart') || '2026-10-22', end = g('tripEnd') || '2026-10-29';
  const fmt = d => String(d).slice(5).replace('-', '.');
  return { title: g('tripTitle') || '釜山旅遊工具', dates: `${String(start).slice(0, 4)}.${fmt(start)} – ${fmt(end)}` };
}
