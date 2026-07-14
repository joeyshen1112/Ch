import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS } from '../app/spots-data.js';

test('SPOTS 資料完整性', () => {
  assert.equal(SPOTS.length >= 90, true);
  assert.equal(new Set(SPOTS.map(s => s.id)).size, SPOTS.length); // id 唯一
  for (const s of SPOTS) {
    assert.equal(typeof s.n === 'string' && s.n.length > 0, true);
    assert.equal(typeof s.ko === 'string' && s.ko.length > 0, true);
    assert.equal(typeof s.cat, 'string');
    assert.equal(Number.isFinite(s.lat) && Number.isFinite(s.lng), true);
    assert.equal(typeof s.district === 'string' && s.district.length > 0, true);
    assert.match(s.c, /^#[0-9A-Fa-f]{6}$/);
  }
});
