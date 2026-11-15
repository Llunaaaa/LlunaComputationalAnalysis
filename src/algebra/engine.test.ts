import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rearrangeEquation, simplifyExpression } from './engine.ts';

test('simplifies a distributive expression', () => {
  assert.equal(simplifyExpression('2(x+2)'), '2x + 4');
});

test('simplifies parenthesized integer powers', () => {
  assert.equal(simplifyExpression('2(x+2)^2'), '2x^2 + 8x + 8');
});

test('preserves subtraction while expanding products', () => {
  assert.equal(simplifyExpression('3x(x-2)^2'), '3x^3 - 12x^2 + 12x');
});

test('simplifies both sides of an equation without solving it', () => {
  assert.equal(simplifyExpression('3x(x+2)=2'), '3x^2 + 6x = 2');
});

test('rearranges the initial reciprocal lens-equation form for f', () => {
  const result = rearrangeEquation(
    '\\frac{1}{f}=(n-1)\\left(\\frac{1}{R_1}-\\frac{1}{R_2}+\\frac{(n-1)d}{nR_1R_2}\\right)',
    'f',
  );
  assert.ok(result.startsWith('f = \\frac{1}{'));
});

test('reports unsupported rearrangement targets explicitly', () => {
  assert.throws(() => rearrangeEquation('y = x^2', 'x'), /not supported/);
});

test('rearranges general additive, multiplicative, and fractional equations', () => {
  assert.equal(rearrangeEquation('y = m*x + b', 'x'), 'x = \\frac{y - b}{m}');
  assert.equal(rearrangeEquation('a = 3x + 2', 'x'), 'x = \\frac{a - 2}{3}');
  assert.equal(rearrangeEquation('p = (x - 4) / k', 'x'), 'x = pk + 4');
});

test('renders rearranged multiplication without programming operators', () => {
  const result = rearrangeEquation(String.raw`\frac{1}{4x}t^2+uv=yw`, 'yw');
  assert.equal(result, String.raw`yw = \frac{1}{4x}t^{2} + uv`);
  assert.doesNotMatch(result, /[*/]/);
});

test('rearranges equations containing arbitrary variable names', () => {
  assert.equal(rearrangeEquation('total = rate * time', 'time'), 'time = \\frac{total}{rate}');
});

test('rearranges every target in the default lens equation', () => {
  const equation = '\\frac{1}{f}=(n-1)\\left(\\frac{1}{R_1}-\\frac{1}{R_2}+\\frac{(n-1)d}{nR_1R_2}\\right)';
  for (const target of ['f', 'R_1', 'R_2', 'n', 'd']) {
    assert.ok(rearrangeEquation(equation, target).startsWith(`${target} = `));
    assert.equal(rearrangeEquation(equation.replaceAll('\\frac', '\\cfrac'), target), rearrangeEquation(equation, target));
  }
});
