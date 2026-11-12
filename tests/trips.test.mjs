import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memStorage, LS } from '../app/sync.js';
import { migrateLegacy, listTrips, currentTrip, addTrip, switchTrip, removeTrip, tripStorage, tripLabel, tripIdOf, tripFeatures } from '../app/trips.js';

const A = { url: 'https://script.google.com/macros/s/AAA/exec', token: 'ta' };
const B = { url: 'https://script.google.com/macros/s/BBB/exec', token: 'tb' };

test('舊版單一配對：搬成第一份行程，快取一起帶過去', () => {
  const s = memStorage();
  s.setItem(LS.pair, JSON.stringify(A));
  s.setItem(LS.data, '{"settings":{}}');
  s.setItem(LS.queue, '[1]');
  s.setItem(LS.lastSync, '99');
  migrateLegacy(s);
  const id = tripIdOf(A.url);
  assert.deepEqual(listTrips(s), [{ id, ...A }]);
  assert.equal(currentTrip(s).id, id);
  const ts = tripStorage(s, id);
  assert.equal(ts.getItem(LS.data), '{"settings":{}}');
  assert.equal(ts.getItem(LS.queue), '[1]');
  assert.equal(ts.getItem(LS.lastSync), '99');
  // 只搬一次：之後再跑不會覆蓋
  s.setItem(LS.data, '{"x":1}');
  migrateLegacy(s);
  assert.equal(ts.getItem(LS.data), '{"settings":{}}');
});

test('沒配對過：遷移後是空清單', () => {
  const s = memStorage();
  migrateLegacy(s);
  assert.deepEqual(listTrips(s), []);
  assert.equal(currentTrip(s), null);
});

test('加入第二份不會清掉第一份的資料，可來回切換', () => {
  const s = memStorage();
  migrateLegacy(s);
  const a = addTrip(s, A);
  tripStorage(s, a).setItem(LS.data, 'A的資料');
  const b = addTrip(s, B);
  assert.equal(currentTrip(s).id, b);
  assert.equal(tripStorage(s, b).getItem(LS.data), null);
  assert.equal(tripStorage(s, a).getItem(LS.data), 'A的資料');
  switchTrip(s, a);
  assert.equal(currentTrip(s).token, 'ta');
  switchTrip(s, 'nope'); // 不存在的 id 不切
  assert.equal(currentTrip(s).id, a);
});

test('同一個網址換 TOKEN：更新同一份，不多出一份', () => {
  const s = memStorage();
  const a = addTrip(s, A);
  tripStorage(s, a).setItem(LS.data, '保留');
  addTrip(s, { url: A.url, token: 'new' });
  assert.equal(listTrips(s).length, 1);
  assert.equal(currentTrip(s).token, 'new');
  assert.equal(tripStorage(s, a).getItem(LS.data), '保留');
});

test('移除目前這份：清掉它的快取，切到剩下的那份', () => {
  const s = memStorage();
  const a = addTrip(s, A);
  const b = addTrip(s, B);
  tripStorage(s, b).setItem(LS.data, 'B');
  removeTrip(s, b);
  assert.equal(tripStorage(s, b).getItem(LS.data), null);
  assert.equal(currentTrip(s).id, a);
  removeTrip(s, a);
  assert.equal(currentTrip(s), null);
});

test('tripStorage 只替同步用的 key 加前綴，其他 key 共用', () => {
  const s = memStorage();
  const ts = tripStorage(s, 'x');
  ts.setItem(LS.tab, 'expenses');
  assert.equal(s.getItem(LS.tab), 'expenses');
  ts.setItem(LS.data, 'd');
  assert.equal(s.getItem(LS.data), null);
  assert.equal(s.getItem(LS.data + '.x'), 'd');
});

test('清單標籤：讀該份的名稱與日期，沒設定用預設', () => {
  const s = memStorage();
  s.setItem(LS.data + '.n', JSON.stringify({ settings: {
    tripTitle: { key: 'tripTitle', value: '東京' },
    tripStart: { key: 'tripStart', value: '2026-11-16' },
    tripEnd: { key: 'tripEnd', value: '2026-11-19' },
  } }));
  assert.deepEqual(tripLabel(s, 'n'), { title: '東京', dates: '2026.11.16 – 11.19' });
  assert.deepEqual(tripLabel(s, 'none'), { title: '釜山旅遊工具', dates: '2026.10.22 – 10.29' });
});

test('畫面設定：沒設定就是三個分頁、原尺寸', () => {
  assert.deepEqual(tripFeatures({}), { tabs: ['itinerary', 'expenses', 'phrases'], fontScale: 1 });
  assert.deepEqual(tripFeatures(undefined), { tabs: ['itinerary', 'expenses', 'phrases'], fontScale: 1 });
});

test('畫面設定：只留行程、字體 1.2 倍', () => {
  const st = { tabs: { key: 'tabs', value: 'itinerary' }, fontScale: { key: 'fontScale', value: '1.2' } };
  assert.deepEqual(tripFeatures(st), { tabs: ['itinerary'], fontScale: 1.2 });
});

test('畫面設定：寫錯的分頁忽略、順序固定、倍率限制在 1–1.5', () => {
  const f = v => tripFeatures({ tabs: { value: v.tabs }, fontScale: { value: v.scale } });
  assert.deepEqual(f({ tabs: ' phrases , itinerary,abc', scale: '9' }), { tabs: ['itinerary', 'phrases'], fontScale: 1.5 });
  assert.deepEqual(f({ tabs: 'abc', scale: '0.5' }).tabs, ['itinerary', 'expenses', 'phrases']);
  assert.equal(f({ tabs: '', scale: '0.5' }).fontScale, 1);
  assert.equal(f({ tabs: '', scale: 'big' }).fontScale, 1);
});
