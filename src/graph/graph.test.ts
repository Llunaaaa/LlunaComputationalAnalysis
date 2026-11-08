import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, GraphModel } from './graphModel.ts';
import { defaultViewport, sampleCurve, zoomAroundCursor, type Viewport } from './plot.ts';

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

function modelOf(...latex: string[]): GraphModel {
  const model = new GraphModel();
  model.update(latex.map((text, index) => ({ id: index + 1, latex: text })));
  return model;
}

function valueAt(model: GraphModel, id: number, x: number): number {
  const entry = model.entries.find((item) => item.id === id)!;
  assert.ok(entry.program, `row ${id} has no program: ${entry.error}`);
  const env = model.environment(entry.program);
  env[0] = x;
  return entry.program.evaluate(env);
}

test('classification of rows', () => {
  assert.equal(classify('').kind, 'blank');
  assert.deepEqual(classify('y=x^2'), { kind: 'curve', body: 'x ^ (2)' });
  assert.equal(classify('x^2').kind, 'curve');
  assert.equal(classify('x=3').kind, 'vertical');
  assert.deepEqual(classify('y-x=3'), { kind: 'curve', body: '1*x + 3' });
  assert.deepEqual(classify('2y+4=x'), { kind: 'curve', body: '0.5*x - 2' });
  assert.deepEqual(classify('a=50'), { kind: 'variable', name: 'a', body: '50', literal: 50 });
  assert.equal(classify('a=-50').literal, -50);
  assert.equal(classify('g=-.5').literal, -0.5);
  assert.equal(classify('a=2\\pi').literal, undefined);
  assert.equal(classify('a=2\\pi').kind, 'variable');
  assert.equal(classify('\\pi=3').kind, 'invalid');
  assert.equal(classify('a=b=c').kind, 'invalid');
  assert.equal(classify('a=').kind, 'invalid');
  assert.equal(classify('\\frac{}{}').kind, 'invalid');
});

test('sum, product, e and pi graph correctly', () => {
  const model = modelOf('y=\\prod_{i=3}^{19} i^{2}x', 'y=\\sum_{n=1}^{4}nx', 'y=e^{x}+\\pi', 'y=\\pi x', 'y=2e');
  for (const entry of model.entries) assert.equal(entry.error, undefined, entry.error);
  let product = 1;
  for (let i = 3; i <= 19; i += 1) product *= i * i * 1.5;
  near(valueAt(model, 1, 1.5), product);
  near(valueAt(model, 2, 2), 20);
  near(valueAt(model, 3, 1), Math.E + Math.PI);
  near(valueAt(model, 4, 2), 2 * Math.PI);
  near(valueAt(model, 5, 0), 2 * Math.E);
});

test('sliders feed every curve that uses them, including juxtaposition', () => {
  const model = modelOf('a=2', 'g=-3', 'y=axg', 'y=x^{2}');
  assert.deepEqual(model.names, ['a', 'g']);
  near(valueAt(model, 3, 5), -30);
  const curve = model.entries[2].program!;
  const unrelated = model.entries[3].program!;
  assert.deepEqual([...curve.uses].sort(), ['a', 'g', 'x']);
  assert.equal(model.dependencyKey(unrelated), '');
  const before = model.dependencyKey(curve);

  model.update([{ id: 1, latex: 'a=4' }, { id: 2, latex: 'g=-3' }, { id: 3, latex: 'y=axg' }, { id: 4, latex: 'y=x^{2}' }]);
  assert.equal(model.entries[2].program, curve, 'slider change must not recompile');
  assert.notEqual(model.dependencyKey(curve), before);
  near(valueAt(model, 3, 5), -60);
});

test('derived variables resolve in dependency order and cycles are reported', () => {
  const model = modelOf('b=2a+1', 'a=3', 'y=bx');
  assert.equal(model.entries[0].error, undefined);
  near(valueAt(model, 3, 2), 14);

  const cyclic = modelOf('p=q+1', 'q=p+1', 'y=px');
  assert.match(cyclic.entries[0].error ?? '', /Circular/);
  assert.match(cyclic.entries[1].error ?? '', /Circular/);
  assert.ok(Number.isNaN(valueAt(cyclic, 3, 1)));
});

test('errors for duplicates, unknown names and x-dependent definitions', () => {
  const model = modelOf('a=1', 'a=2', 'y=kx', 'c=x+1', 'x=a', 'x=x');
  assert.match(model.entries[1].error ?? '', /already defined/);
  assert.match(model.entries[2].error ?? '', /Unknown identifier/);
  assert.match(model.entries[3].error ?? '', /cannot depend on x/);
  assert.equal(model.entries[4].error, undefined);
  assert.match(model.entries[5].error ?? '', /must not depend on x/);
});

test('calculus rows graph with scoped variables', () => {
  const model = modelOf('y=\\int_{0}^{x}t^{2}\\,dt', 'y=\\frac{d}{dx}x^{3}', 'y=\\lim_{h\\to0}\\frac{\\sin(hx)}{h}');
  for (const entry of model.entries) assert.equal(entry.error, undefined, entry.error);
  near(valueAt(model, 1, 3), 9, 1e-8);
  near(valueAt(model, 2, 2), 12, 1e-6);
  near(valueAt(model, 3, 0.7), 0.7, 1e-6);
});

const VIEW: Viewport = defaultViewport();

test('sampler reaches domain edges and breaks at poles', () => {
  const sqrt = sampleCurve(Math.sqrt, VIEW, 800, 600);
  assert.equal(sqrt.length, 1);
  near(sqrt[0][0], 400, 1e-3);

  const reciprocal = sampleCurve((x) => 1 / x, VIEW, 800, 600);
  assert.equal(reciprocal.length, 2, 'one branch per side of the pole');

  const tangent = sampleCurve(Math.tan, VIEW, 800, 600);
  assert.equal(tangent.length, 7, 'tan over [-8, 8] has 6 poles');

  const floor = sampleCurve(Math.floor, VIEW, 800, 600);
  assert.equal(floor.length, 16, 'one segment per step');

  const nothing = sampleCurve(() => Number.NaN, VIEW, 800, 600);
  assert.equal(nothing.length, 0);

  for (const f of [Math.sin, (x: number) => 1e4 * x, (x: number) => x ** 3 - 40 * x, Math.exp, Math.atan]) {
    assert.equal(sampleCurve(f, VIEW, 800, 600).length, 1, `continuous ${f} must not break`);
  }
});

test('sampler stays within its evaluation budget on wild curves', () => {
  let evaluations = 0;
  sampleCurve((x) => { evaluations += 1; return Math.sin(1 / x); }, VIEW, 800, 600);
  assert.ok(evaluations <= 801 * 24 + 64, `${evaluations} evaluations`);
});

test('deep zoom keeps the point under the cursor fixed', () => {
  let view = VIEW;
  const cursor = { x: 517, y: 211 };
  const anchor = { x: view.centerX + (cursor.x - 400) * view.unitsPerPixel, y: view.centerY - (cursor.y - 300) * view.unitsPerPixel };
  for (let i = 0; i < 60; i += 1) view = zoomAroundCursor(view, cursor, 800, 600, 0.5);
  near(view.centerX + (cursor.x - 400) * view.unitsPerPixel, anchor.x, 1e-12);
  const segments = sampleCurve((x) => x * x, view, 800, 600);
  assert.ok(segments.length >= 1);
});
