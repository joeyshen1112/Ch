import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePairCode, decodePairCode, mergeServerRecords, memStorage, SyncEngine } from '../app/sync.js';

test('配對碼 roundtrip', () => {
  const code = encodePairCode('https://script.google.com/macros/s/x/exec', 'secret123');
  assert.deepEqual(decodePairCode(code), { url: 'https://script.google.com/macros/s/x/exec', token: 'secret123' });
});

test('配對碼非法輸入回 null', () => {
  assert.equal(decodePairCode('not-base64!!'), null);
  assert.equal(decodePairCode(btoa(JSON.stringify({ url: 'http://insecure', token: 'x' }))), null);
  assert.equal(decodePairCode(btoa(JSON.stringify({ url: 'https://ok' }))), null);
});

test('merge：伺服器較新覆蓋、本地較新保留、pending 跳過', () => {
  const local = {
    a: { id: 'a', title: '舊', updatedAt: 100 },
    b: { id: 'b', title: '本地新', updatedAt: 900 },
    c: { id: 'c', title: '排隊中', updatedAt: 100 },
  };
  const server = [
    { id: 'a', title: '伺服器新', updatedAt: 500 },
    { id: 'b', title: '伺服器舊', updatedAt: 500 },
    { id: 'c', title: '伺服器版', updatedAt: 500 },
    { id: 'd', title: '新增', updatedAt: 500 },
  ];
  const out = mergeServerRecords(local, server, new Set(['c']), 'id');
  assert.equal(out.a.title, '伺服器新');
  assert.equal(out.b.title, '本地新');
  assert.equal(out.c.title, '排隊中');
  assert.equal(out.d.title, '新增');
});

test('memStorage 行為同 localStorage 介面', () => {
  const s = memStorage();
  assert.equal(s.getItem('x'), null);
  s.setItem('x', '1');
  assert.equal(s.getItem('x'), '1');
  s.removeItem('x');
  assert.equal(s.getItem('x'), null);
});

function fakeTransport() {
  const calls = { push: [], pull: [] };
  const t = {
    calls,
    failPush: false,
    pullResponse: { serverTime: 1000, itinerary: [], expenses: [], phrases: [], settings: {} },
    async push(ops) {
      calls.push.push(ops);
      if (t.failPush) throw new Error('network');
      return { serverTime: 1000, applied: ops.map(o => o.record.id || o.record.key) };
    },
    async pull(since) { calls.pull.push(since); return t.pullResponse; },
  };
  return t;
}
const makeEngine = t => new SyncEngine({ transport: t, storage: memStorage(), pollMs: 999999 });

test('upsert 樂觀更新並去重排隊', () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true; // 暫停 flush，確定性地觀察佇列去重
  e.upsert('expenses', { id: 'x1', title: 'v1', amount: 100, updatedAt: 1 });
  e.upsert('expenses', { id: 'x1', title: 'v2', amount: 200, updatedAt: 2 });
  assert.equal(e.data.expenses.x1.title, 'v2');
  assert.equal(e.pendingCount(), 1); // 同 id 只留最新一筆
  assert.equal(e.queue[0].record.title, 'v2');
});

test('flush 成功清空佇列、失敗保留佇列', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true;
  e.upsert('expenses', { id: 'x1', title: 'a', updatedAt: 1 });
  e.flushing = false;
  t.failPush = true;
  await e.flush();
  assert.equal(e.pendingCount(), 1);
  clearTimeout(e.retryTimer);
  t.failPush = false;
  await e.flush();
  assert.equal(e.pendingCount(), 0);
  assert.equal(t.calls.push.length, 2);
});

test('pull 合併伺服器資料、pending 記錄不被覆蓋、lastSync 前進', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true; // p1 留在佇列，模擬尚未送出
  e.upsert('expenses', { id: 'p1', title: '本地排隊', updatedAt: 1 });
  t.pullResponse = {
    serverTime: 2000,
    itinerary: [],
    expenses: [
      { id: 'p1', title: '伺服器版', updatedAt: 1500 },
      { id: 's1', title: '別機新增', updatedAt: 1500 },
    ],
    phrases: [{ category: '點餐', zh: '你好', ko: '안녕하세요', roman: 'annyeonghaseyo' }],
    settings: { exchangeRate: '0.024' },
  };
  await e.pull();
  assert.equal(e.data.expenses.p1.title, '本地排隊');
  assert.equal(e.data.expenses.s1.title, '別機新增');
  assert.equal(e.data.settings.exchangeRate.value, '0.024');
  assert.equal(e.data.phrases.length, 1);
  assert.equal(e.lastSync, 2000);
});

test('unauthorized 透過 onStatus 通報', async () => {
  const statuses = [];
  const t = fakeTransport();
  t.pull = async () => { throw new Error('unauthorized'); };
  const e = new SyncEngine({ transport: t, storage: memStorage(), onStatus: s => statuses.push(s), pollMs: 999999 });
  await e.pull();
  assert.equal(statuses.some(s => s.unauthorized === true), true);
});

test('資料與佇列持久化到 storage 並可重建', async () => {
  const s = memStorage();
  const t = fakeTransport();
  const e1 = new SyncEngine({ transport: t, storage: s, pollMs: 999999 });
  e1.flushing = true; // 不送出，驗證持久化
  e1.upsert('expenses', { id: 'k1', title: '存起來', updatedAt: 1 });
  const e2 = new SyncEngine({ transport: t, storage: s, pollMs: 999999 });
  assert.equal(e2.data.expenses.k1.title, '存起來');
  assert.equal(e2.pendingCount(), 1);
});
