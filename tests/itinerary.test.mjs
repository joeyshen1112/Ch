import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayRange, sortedDayItems, midpoint, insertOrderForTime, needsRenorm, renormalize, kakaoMapUrl, mapLinkFor, chipScrollTarget, splitTitleEmoji } from '../app/itinerary.js';

test('dayRange 起訖含端點', () => {
  const days = dayRange('2026-10-22', '2026-10-29');
  assert.equal(days.length, 8);
  assert.equal(days[0], '2026-10-22');
  assert.equal(days[7], '2026-10-29');
});

test('dayRange 非法輸入回空陣列', () => {
  assert.deepEqual(dayRange('bad', '2026-10-29'), []);
  assert.deepEqual(dayRange('2026-10-29', '2026-10-22'), []);
});

test('midpoint 邊界', () => {
  assert.equal(midpoint(null, null), 1);
  assert.equal(midpoint(null, 5), 4);
  assert.equal(midpoint(5, null), 6);
  assert.equal(midpoint(1, 2), 1.5);
});

test('insertOrderForTime：依時間插入、無時間排最後', () => {
  const items = [
    { id: 'a', time: '09:00', sortOrder: 1 },
    { id: 'b', time: '12:00', sortOrder: 2 },
  ];
  assert.equal(insertOrderForTime(items, '10:30'), 1.5); // 09:00 與 12:00 之間
  assert.equal(insertOrderForTime(items, ''), 3);        // 無時間 → 最後
  assert.equal(insertOrderForTime(items, '08:00'), 0);   // 比全部早 → 最前（midpoint(null,1)）
  assert.equal(insertOrderForTime([], '10:00'), 1);      // 空日 → 1
});

test('sortedDayItems 過濾與排序', () => {
  const records = {
    a: { id: 'a', day: 'D', sortOrder: 2, updatedAt: 1, deleted: 0 },
    b: { id: 'b', day: 'D', sortOrder: 1, updatedAt: 1, deleted: 0 },
    c: { id: 'c', day: 'D', sortOrder: 3, updatedAt: 1, deleted: 1 },
    d: { id: 'd', day: 'E', sortOrder: 0, updatedAt: 1, deleted: 0 },
  };
  assert.deepEqual(sortedDayItems(records, 'D').map(r => r.id), ['b', 'a']);
});

test('needsRenorm 與 renormalize', () => {
  assert.equal(needsRenorm([{ sortOrder: 1 }, { sortOrder: 1 + 1e-9 }]), true);
  assert.equal(needsRenorm([{ sortOrder: 1 }, { sortOrder: 2 }]), false);
  const out = renormalize([{ id: 'x', sortOrder: 0.5 }, { id: 'y', sortOrder: 0.6 }]);
  assert.deepEqual(out.map(r => r.sortOrder), [1, 2]);
  assert.equal(out[0].id, 'x'); // 保持原順序、整筆複本
});

test('kakaoMapUrl 編碼', () => {
  assert.equal(kakaoMapUrl('佛國寺', 35.78988, 129.33189),
    'https://map.kakao.com/link/map/%E4%BD%9B%E5%9C%8B%E5%AF%BA,35.78988,129.33189');
});

test('dayRange 拒絕月曆不存在日期、超長區間截斷 60 天', () => {
  assert.deepEqual(dayRange('2026-02-30', '2026-03-05'), []);
  assert.equal(dayRange('2026-01-01', '2026-12-31').length, 60);
});

/* ---------- 地圖連結三層 fallback ---------- */

const SPOT = { n: '佛國寺', lat: 35.78988, lng: 129.33189 };

test('mapLinkFor 第一層：有 mapUrl 就用它，勝過景點座標', () => {
  const link = mapLinkFor({ title: '佛國寺', mapUrl: 'https://maps.app.goo.gl/abc123' }, SPOT);
  assert.equal(link, 'https://maps.app.goo.gl/abc123');
});

test('mapLinkFor 第二層：沒有 mapUrl 時用景點座標', () => {
  assert.equal(mapLinkFor({ title: '佛國寺' }, SPOT), kakaoMapUrl('佛國寺', 35.78988, 129.33189));
});

test('mapLinkFor 第三層：沒有 mapUrl 也沒有景點時用標題搜尋', () => {
  assert.equal(mapLinkFor({ title: '豬肉湯飯 本店' }, null),
    'https://map.kakao.com/link/search/%E8%B1%AC%E8%82%89%E6%B9%AF%E9%A3%AF%20%E6%9C%AC%E5%BA%97');
});

test('mapLinkFor 擋掉非 http(s) 的 mapUrl 並退回下一層', () => {
  assert.equal(mapLinkFor({ title: '佛國寺', mapUrl: 'javascript:alert(1)' }, SPOT),
    kakaoMapUrl('佛國寺', 35.78988, 129.33189));
  assert.equal(mapLinkFor({ title: 'X', mapUrl: '  JavaScript:alert(1)  ' }, null),
    'https://map.kakao.com/link/search/X');
  assert.equal(mapLinkFor({ title: 'X', mapUrl: 'data:text/html,<script>' }, null),
    'https://map.kakao.com/link/search/X');
  assert.equal(mapLinkFor({ title: 'X', mapUrl: '不是網址' }, null),
    'https://map.kakao.com/link/search/X');
});

test('mapLinkFor 三層都沒有時回空字串（不渲染 📍）', () => {
  assert.equal(mapLinkFor({ title: '' }, null), '');
  assert.equal(mapLinkFor({ title: '   ' }, null), '');
  assert.equal(mapLinkFor({}, null), '');
  assert.equal(mapLinkFor(null, null), '');
});

/* ---------- 日期 chips 捲動位置 ---------- */

test('chipScrollTarget：選中的 chip 已在可視範圍內時維持原位，不亂跳', () => {
  assert.equal(chipScrollTarget(100, 300, 150, 64), 100);
  assert.equal(chipScrollTarget(0, 300, 0, 64), 0);
  assert.equal(chipScrollTarget(100, 300, 336, 64), 100); // 剛好貼齊右緣
});

test('chipScrollTarget：chip 在可視範圍左邊時捲回來並置中', () => {
  assert.equal(chipScrollTarget(300, 300, 50, 64), 0);        // 置中會小於 0 → 夾到 0
  assert.equal(chipScrollTarget(300, 300, 200, 64), 82);      // 200 - (300-64)/2
});

test('chipScrollTarget：chip 在可視範圍右邊時捲過去並置中', () => {
  assert.equal(chipScrollTarget(0, 300, 400, 64), 282);       // 400 - 118
  assert.equal(chipScrollTarget(0, 300, 337, 64), 219);       // 超出 1px 也會捲
});

test('chipScrollTarget：永遠不回傳負數', () => {
  assert.equal(chipScrollTarget(500, 300, 0, 64), 0);
  assert.ok(chipScrollTarget(0, 300, 0, 400) >= 0);           // chip 比容器寬的極端情況
});

/* ---------- 標題開頭的 emoji 抽出來放到色塊 ---------- */

test('splitTitleEmoji 抽出開頭 emoji 並從標題移除', () => {
  assert.deepEqual(splitTitleEmoji('🚌 慶州一日遊 集合'), { emoji: '🚌', text: '慶州一日遊 集合' });
  assert.deepEqual(splitTitleEmoji('🥐早餐 前天買的麵包'), { emoji: '🥐', text: '早餐 前天買的麵包' });
});

test('splitTitleEmoji 處理變異選擇器與旗幟', () => {
  assert.deepEqual(splitTitleEmoji('⛩️ 海東龍宮寺'), { emoji: '⛩️', text: '海東龍宮寺' });
  assert.deepEqual(splitTitleEmoji('✈️ CI190 桃園T1 → 釜山金海'), { emoji: '✈️', text: 'CI190 桃園T1 → 釜山金海' });
  assert.deepEqual(splitTitleEmoji('🇰🇷 韓文練習'), { emoji: '🇰🇷', text: '韓文練習' });
});

test('splitTitleEmoji 只認開頭，不動標題中間或結尾的 emoji', () => {
  assert.deepEqual(splitTitleEmoji('回到西面 🚌'), { emoji: '', text: '回到西面 🚌' });
  assert.deepEqual(splitTitleEmoji('午餐（二選一）'), { emoji: '', text: '午餐（二選一）' });
  assert.deepEqual(splitTitleEmoji('Skyline Luge 斜坡滑車'), { emoji: '', text: 'Skyline Luge 斜坡滑車' });
});

test('splitTitleEmoji 對空值安全', () => {
  assert.deepEqual(splitTitleEmoji(''), { emoji: '', text: '' });
  assert.deepEqual(splitTitleEmoji(null), { emoji: '', text: '' });
  assert.deepEqual(splitTitleEmoji(undefined), { emoji: '', text: '' });
  assert.deepEqual(splitTitleEmoji('🧳'), { emoji: '🧳', text: '' });
});
