import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayRange, sortedDayItems, midpoint, insertOrderForTime, needsRenorm, renormalize, kakaoMapUrl } from '../app/itinerary.js';

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
