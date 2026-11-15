import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvaluation } from './presentation.ts';

test('exact results prefer symbolic output over decimal display values', () => {
  assert.deepEqual(formatEvaluation({
    value: 1 / 81,
    exact: '1/81',
    display_value: '0.0123456790123457',
    is_approximate: false,
    error: null,
  }, false), { text: '0.0123456790123457', isApproximate: true });
  assert.deepEqual(formatEvaluation({
    value: 26 / 3,
    exact: '26/3',
    display_value: '8.66666666666667',
    is_approximate: false,
    error: null,
  }, false), { text: '8.66666666666667', isApproximate: true });
  assert.deepEqual(formatEvaluation({
    value: 60,
    exact: '60',
    display_value: '60',
    is_approximate: false,
    error: null,
  }, false), { text: '60', isApproximate: false });
  assert.deepEqual(formatEvaluation({
    value: 1 / 81,
    exact: '1/81',
    display_value: '0.0123456790123457',
    is_approximate: false,
    error: null,
  }, true), { text: '1/81', isApproximate: false });
});

test('approximate results retain decimal display values', () => {
  assert.deepEqual(formatEvaluation({
    value: Math.PI,
    exact: null,
    display_value: '3.14159265358979',
    is_approximate: true,
    error: null,
  }, false), { text: '3.14159265358979', isApproximate: true });
});
