import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhase } from '../app/ui.js';

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
