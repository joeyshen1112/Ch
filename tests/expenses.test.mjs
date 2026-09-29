import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseTotals, toTWD, todayStr, payerTotals, payerLabel } from '../app/expenses.js';

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

/* ---------- 各付款人小計 ---------- */

test('payerTotals：依付款人加總、折算 TWD、排除軟刪除', () => {
  const rate = 0.023;
  const recs = [
    { payer: '陽', amount: 10000, currency: 'KRW', deleted: 0 },  // 230
    { payer: '陽', amount: 500,   currency: 'TWD', deleted: 0 },  // 500
    { payer: '淇', amount: 20000, currency: 'KRW', deleted: 0 },  // 460
    { payer: '淇', amount: 99999, currency: 'KRW', deleted: 1 },  // 已刪除，不計
  ];
  assert.deepEqual(payerTotals(recs, rate), { '陽': 730, '淇': 460 });
});

test('payerTotals：沒有付款人的歸「未指定」', () => {
  const recs = [
    { amount: 100, currency: 'TWD', deleted: 0 },
    { payer: '', amount: 200, currency: 'TWD', deleted: 0 },
    { payer: '  ', amount: 300, currency: 'TWD', deleted: 0 },
    { payer: '陽', amount: 400, currency: 'TWD', deleted: 0 },
  ];
  assert.deepEqual(payerTotals(recs, 0.023), { '未指定': 600, '陽': 400 });
});

test('payerTotals：空清單回空物件', () => {
  assert.deepEqual(payerTotals([], 0.023), {});
  assert.deepEqual(payerTotals([{ payer: '陽', amount: 1, currency: 'TWD', deleted: 1 }], 0.023), {});
});

test('payerLabel：加上辨識用的 emoji，未知值原樣回傳', () => {
  assert.equal(payerLabel('陽'), '☀️ 陽');
  assert.equal(payerLabel('淇'), '7️⃣ 淇');
  assert.equal(payerLabel('未指定'), '未指定');
  assert.equal(payerLabel(''), '');
  assert.equal(payerLabel(null), '');
  assert.equal(payerLabel(undefined), '');
});
