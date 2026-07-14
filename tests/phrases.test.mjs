import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PHRASES, allPhrases, papagoUrl } from '../app/phrases.js';

test('內建短語完整性：至少 45 句、五分類齊全、欄位完整', () => {
  assert.equal(BUILTIN_PHRASES.length >= 45, true);
  const cats = new Set(BUILTIN_PHRASES.map(p => p.category));
  for (const c of ['點餐', '交通', '購物', '住宿', '緊急']) assert.equal(cats.has(c), true);
  for (const p of BUILTIN_PHRASES) {
    assert.equal(typeof p.zh === 'string' && p.zh.length > 0, true);
    assert.equal(typeof p.ko === 'string' && p.ko.length > 0, true);
    assert.equal(typeof p.roman === 'string' && p.roman.length > 0, true);
  }
});

test('allPhrases：內建與 Sheet 聯集、分類內先內建後 Sheet、略過缺欄位列', () => {
  const sheet = [
    { category: '點餐', zh: '請給我烤肉', ko: '고기 주세요', roman: 'go-gi ju-se-yo' },
    { category: '點餐', zh: '', ko: 'x', roman: '' }, // 缺 zh → 略過
  ];
  const out = allPhrases(sheet);
  assert.equal(out.length, BUILTIN_PHRASES.length + 1);
  const dining = out.filter(p => p.category === '點餐');
  assert.equal(dining[dining.length - 1].zh, '請給我烤肉'); // Sheet 排在該分類最後
});

test('papagoUrl 編碼', () => {
  assert.equal(papagoUrl('這個可以刷卡嗎？'),
    'https://papago.naver.com/?sk=zh-TW&tk=ko&st=' + encodeURIComponent('這個可以刷卡嗎？'));
});
