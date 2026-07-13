import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePairCode, decodePairCode, mergeServerRecords, memStorage, SyncEngine, gasTransport } from '../app/sync.js';

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
  await e.flush(true);
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

test('送出失敗且飛行中記錄已被更新時，過時版本不重複入列', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  let rejectPush;
  t.push = () => new Promise((_, rej) => { rejectPush = rej; }); // 手動控制失敗時機
  e.upsert('expenses', { id: 'x1', title: 'v1', updatedAt: 1 }); // 進入 inFlight
  e.upsert('expenses', { id: 'x1', title: 'v2', updatedAt: 2 }); // 送出期間的新版本 → queue
  rejectPush(new Error('network'));
  await new Promise(r => setTimeout(r, 0)); // 讓 catch/finally 跑完
  assert.equal(e.pendingCount(), 1);        // v1 被 v2 取代，不重複
  assert.equal(e.queue[0].record.title, 'v2');
  clearTimeout(e.retryTimer);
});

test('退避期間的 upsert 不會立即重送，flush(true) 可強制', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true;
  e.upsert('expenses', { id: 'b1', title: 'a', updatedAt: 1 });
  e.flushing = false;
  t.failPush = true;
  await e.flush();                    // 失敗 → 進入退避
  const callsAfterFail = t.calls.push.length;
  e.upsert('expenses', { id: 'b2', title: 'b', updatedAt: 2 }); // 退避期間新增
  await new Promise(r => setTimeout(r, 0));
  assert.equal(t.calls.push.length, callsAfterFail); // 沒有立即重送
  t.failPush = false;
  await e.flush(true);                // 手動強制
  assert.equal(e.pendingCount(), 0);
  clearTimeout(e.retryTimer);
});

test('flush 一次呼叫排空多批佇列（>50 筆）', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true;
  for (let i = 0; i < 120; i++) e.upsert('expenses', { id: 'm' + i, title: 't', updatedAt: i });
  e.flushing = false;
  await e.flush();
  assert.equal(e.pendingCount(), 0);
  assert.deepEqual(t.calls.push.map(b => b.length), [50, 50, 20]);
});

test('gasTransport 組出正確請求並解包錯誤', async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    seen.push({ url, opts });
    return { json: async () => (seen.length === 3 ? { error: 'unauthorized' } : { serverTime: 1, applied: [] }) };
  };
  const tr = gasTransport({ url: 'https://x.test/exec', token: 'se cret' }, fakeFetch);
  await tr.pull(123);
  assert.equal(seen[0].url, 'https://x.test/exec?action=pull&since=123&token=se%20cret');
  await tr.push([{ tab: 'expenses', record: { id: '1' } }]);
  assert.equal(seen[1].opts.method, 'POST');
  assert.equal(seen[1].opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(seen[1].opts.body), { token: 'se cret', ops: [{ tab: 'expenses', record: { id: '1' } }] });
  await assert.rejects(() => tr.pull(0), /unauthorized/);
});

test('pull 以 lastSync-60s 的重疊視窗增量拉取', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.lastSync = 100000;
  await e.pull();
  assert.equal(t.calls.pull[0], 40000);
});
