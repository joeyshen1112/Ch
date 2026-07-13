import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseTotals, toTWD, todayStr } from '../app/expenses.js';

test('toTWD：KRW 依匯率折算、TWD 原值、四捨五入', () => {
  assert.equal(toTWD({ amount: 18000, currency: 'KRW' }, 0.023), 414);
  assert.equal(toTWD({ amount: 500, currency: 'TWD' }, 0.023), 500);
  assert.equal(toTWD({ amount: 100, currency: 'KRW' }, 0.023), 2); // 2.3 → 2，驗證四捨五入
});

test('expenseTotals：TWD 加總、今日小計、分類統計、排除軟刪除', () => {
  const records = [
    { id: '1', date: '2026-10-24', category: '餐飲', amount: 10000, currency: 'KRW', deleted: 0 },
    { id: '2', date: '2026-10-24', category: '交通', amount: 100, currency: 'TWD', deleted: 0 },
    { id: '3', date: '2026-10-23', category: '餐飲', amount: 20000, currency: 'KRW', deleted: 0 },
    { id: '4', date: '2026-10-24', category: '購物', amount: 99999, currency: 'KRW', deleted: 1 },
  ];
  const t = expenseTotals(records, 0.023, '2026-10-24');
  assert.equal(t.todayTWD, 230 + 100);        // 10000*0.023 + 100
  assert.equal(t.totalTWD, 230 + 100 + 460);  // + 20000*0.023
  assert.equal(t.byCat['餐飲'], 230 + 460);
  assert.equal(t.byCat['購物'], undefined);   // 軟刪除排除
});

test('todayStr 格式', () => {
  assert.match(todayStr(new Date(2026, 9, 24)), /^2026-10-24$/);
});
