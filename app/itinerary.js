/* app/itinerary.js — 行程 tab：日期 chips、卡片時間軸、景點庫搜尋、拖移排序 */
import { SPOTS } from './spots-data.js';

const CAT_EMOJI = { '海灘':'🏖️','觀景':'🌅','寺廟':'⛩️','咖啡':'☕','市場':'🛒','拍照':'📸','自然':'🌿','夜景':'🌃','美食':'🍜','購物':'🛍️','體驗':'🎡','親子':'🧸','歷史':'🏛️' };

/* ---------- 純函式（排序邏輯，見 tests/itinerary.test.mjs） ---------- */
export function dayRange(start, end) {
  const s = new Date(start + 'T00:00:00Z'), e = new Date(end + 'T00:00:00Z');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const out = [];
  for (let t = s.getTime(); t <= e.getTime() && out.length < 60; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function sortedDayItems(records, day) {
  return Object.values(records)
    .filter(r => Number(r.deleted) !== 1 && r.day === day)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || Number(a.updatedAt) - Number(b.updatedAt));
}

export function midpoint(prev, next) {
  if (prev == null && next == null) return 1;
  if (prev == null) return Number(next) - 1;
  if (next == null) return Number(prev) + 1;
  return (Number(prev) + Number(next)) / 2;
}

export function insertOrderForTime(items, time) {
  if (time) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].time && items[i].time > time) {
        return midpoint(i > 0 ? items[i - 1].sortOrder : null, items[i].sortOrder);
      }
    }
  }
  return items.length ? Number(items[items.length - 1].sortOrder) + 1 : 1;
}

export function needsRenorm(items) {
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(Number(items[i].sortOrder) - Number(items[i - 1].sortOrder)) < 1e-6) return true;
  }
  return false;
}

export function renormalize(items) {
  return items.map((r, i) => ({ ...r, sortOrder: i + 1 }));
}

export function kakaoMapUrl(name, lat, lng) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
}
