import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePairCode, decodePairCode, mergeServerRecords, memStorage } from '../app/sync.js';

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
