// Run with: npm test   (Node's built-in runner with type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latexToEngine, PLACEHOLDER_ERROR } from '../latex/index.ts';
import { compileExpression, factorial, realPow } from './index.ts';

function value(latex: string, globals: string[] = [], values: number[] = []): number {
  const program = compileExpression(latexToEngine(latex), globals);
  const env = new Float64Array(program.slotCount);
  env.set(values);
  return program.evaluate(env);
}

function near(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('converter output', () => {
  const cases: [string, string][] = [
    ['\\frac{1}{2}x^{2}', '((1) / (2)) x ^ (2)'],
    ['\\frac12', '((1) / (2))'],
    ['xy^2', 'x y ^ (2)'],
    ['\\sin x\\cos x', '(sin(x)) (cos(x))'],
    ['\\sin^2x', '((sin(x)) ^ (2))'],
    ['\\sin^{-1}\\left(0.5\\right)', '(asin(0.5))'],
    ['\\sum_{i=1}^{10}i^2+1', '(sum(i, 1, 10, i ^ (2))) + 1'],
    ['y=\\prod_{i=3}^{19}i^{2}x', 'y = (prod(i, 3, 19, i ^ (2) x))'],
    ['\\int_0^1x^2\\,dx', '(integral(0, 1, x, x ^ (2)))'],
    ['\\int_{0}^{\\pi}\\sin\\left(x\\right)\\mathrm{d}x', '(integral(0, pi, x, (sin(x))))'],
    ['\\lim_{x\\to0^{+}}\\frac{1}{x}', '(limit(x, 0, right, ((1) / (x))))'],
    ['\\lim_{x\\to-\\infty}e^{x}', '(limit(x, - infinity, e ^ (x)))'],
    ['\\frac{d^2}{dx^2}\\sin(x)', '(derivative_n(2, x, (sin(x))))'],
    ['\\left|x\\right|-|y|', '(abs(x)) - (abs(y))'],
    ['\\sqrt[3]{27}', '(root(3, 27))'],
    ['\\log_{2}8', '(log(2, 8))'],
    ['\\sin(30\\degree)+30^{\\circ}', '(sin(30 °)) + 30 °'],
    ['\\binom{5}{2}', '(nCr(5, 2))'],
    ['a_{1}+\\theta_2', 'a_1 + theta_2'],
    ['2\\times3\\div4', '2 * 3 / 4'],
    ['.5', '0.5'],
  ];
  for (const [latex, expected] of cases) assert.equal(latexToEngine(latex), expected, latex);
});

test('converter errors', () => {
  assert.throws(() => latexToEngine('x^{\\placeholder{}}'), { message: PLACEHOLDER_ERROR });
  assert.throws(() => latexToEngine('\\frac{x}{}'), { message: PLACEHOLDER_ERROR });
  assert.throws(() => latexToEngine('\\le'), { message: 'Unsupported notation: \\le' });
  assert.throws(() => latexToEngine('\\int_0^1 x'), { message: 'Integral requires a differential such as dx' });
  assert.throws(() => latexToEngine('\\sum_{1}^{3} i'), /requires an index/);
});

test('arithmetic values', () => {
  near(value('\\prod_{i=3}^{19}i^{2}'), (factorial(19) / 2) ** 2, 1e-12);
  near(value('\\sum_{k=1}^{100}\\frac{1}{k^2}'), 1.6349839001848923);
  near(value('2\\pi e'), 2 * Math.PI * Math.E);
  near(value('ee'), Math.E * Math.E);
  near(value('\\sin(30\\degree)'), 0.5);
  near(value('\\sqrt[3]{-8}'), -2);
  near(value('(-8)^{\\frac{2}{3}}'), 4);
  near(value('-3^2'), -9);
  near(value('2^{3^2}'), 512);
  near(value('3\\cdot\\int_{0}^{2}x^2dx'), 8);
  near(value('\\int_{0}^{1}\\int_{0}^{x}y\\,dy\\,dx'), 1 / 6);
  near(value('\\frac{d^2}{dx^2}\\sin(x)'), 0, 1e-7);
  near(value('\\lim_{x\\to0}\\frac{\\sin x}{x}'), 1);
  near(value('\\lim_{x\\to0^{+}}x\\ln x'), 0);
  near(value('\\lim_{x\\to\\infty}\\left(1+\\frac{1}{x}\\right)^x'), Math.E, 1e-7);
  near(value('\\sum_{e=1}^{3}e'), 6); // a bound index shadows the constant e
  near(value('0.5!'), Math.sqrt(Math.PI) / 2);
  assert.ok(Number.isNaN(value('\\lim_{x\\to0}\\frac{1}{x}')));
});

test('graph variables and implicit multiplication', () => {
  near(value('xg', ['x', 'g'], [3, 2]), 6);
  near(value('2ag', ['x', 'a', 'g'], [0, 2, 3]), 12);
  near(value('\\prod_{i=3}^{19}i^{2}x', ['x'], [2]), 2 ** 17 * (factorial(19) / 2) ** 2, 1e-12);
  near(value('\\frac{d}{dx}x^3', ['x'], [2]), 12, 1e-8);
  near(value('\\int_0^{x}t\\,dt', ['x'], [4]), 8);
  near(value('\\theta_1x', ['x', 'theta_1'], [2, 5]), 10);
  assert.throws(() => value('xq', ['x']), { message: 'Unknown identifier: xq' });
});

test('constant folding keeps per-sample work minimal', () => {
  const program = compileExpression(latexToEngine('\\sum_{i=1}^{1000}i+x'), ['x']);
  assert.deepEqual([...program.uses], ['x']);
  let calls = 0;
  const env = new Float64Array(program.slotCount);
  const started = performance.now();
  for (let i = 0; i < 10000; i += 1) { env[0] = i; calls += program.evaluate(env) > 0 ? 1 : 0; }
  assert.equal(calls, 10000);
  assert.ok(performance.now() - started < 200, 'folded sum should not be re-summed per sample');
});

test('real powers', () => {
  near(realPow(-8, 1 / 3), -2);
  near(realPow(-8, 2 / 3), 4);
  assert.ok(Number.isNaN(realPow(-8, 0.5)));
  assert.equal(factorial(-3), NaN);
  assert.equal(factorial(5), 120);
});
