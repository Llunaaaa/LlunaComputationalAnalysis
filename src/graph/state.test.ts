import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalsFor, defaultRange, snap } from './state.ts';

test('slider policy keeps the configured precision', () => {
  const range = defaultRange(-6.44);
  assert.deepEqual(range, { min: -6.44, max: 10, step: 0.01 });
  assert.equal(snap(-6.436, range), -6.44);
  assert.equal(snap(20, range), 10);
  assert.equal(decimalsFor(0.001), 3);
});
