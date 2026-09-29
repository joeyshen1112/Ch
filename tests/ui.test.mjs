import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhase, withMinDuration } from '../app/ui.js';

test('loadPhase：同步過就是 ready，不管當下是否離線', () => {
  assert.equal(loadPhase(1790245959278, true), 'ready');
  assert.equal(loadPhase(1790245959278, false), 'ready');
  assert.equal(loadPhase(1, false), 'ready');
});

test('loadPhase：從未同步且線上 → loading', () => {
  assert.equal(loadPhase(0, true), 'loading');
});

test('loadPhase：從未同步且離線 → offline（避免無限轉圈）', () => {
  assert.equal(loadPhase(0, false), 'offline');
});

test('loadPhase：lastSync 為非數字或缺值時視同從未同步', () => {
  assert.equal(loadPhase(undefined, true), 'loading');
  assert.equal(loadPhase(null, true), 'loading');
  assert.equal(loadPhase('', true), 'loading');
  assert.equal(loadPhase('abc', true), 'loading');
  assert.equal(loadPhase(NaN, false), 'offline');
});

/* ---------- 最短可見時間（避免同步太快、動畫一閃而過） ---------- */

test('withMinDuration 回傳 work 的結果', async () => {
  const r = await withMinDuration(async () => 'done', 600, async () => {});
  assert.equal(r, 'done');
});

test('withMinDuration 即使 work 瞬間完成也會等滿指定時間', async () => {
  const slept = [];
  await withMinDuration(async () => 'x', 600, async ms => { slept.push(ms); });
  assert.deepEqual(slept, [600]);
});

test('withMinDuration 讓 work 的錯誤往外拋，不吞掉', async () => {
  await assert.rejects(
    () => withMinDuration(async () => { throw new Error('boom'); }, 600, async () => {}),
    /boom/);
});
