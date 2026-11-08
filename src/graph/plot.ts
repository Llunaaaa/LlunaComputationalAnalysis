// Viewport math and adaptive curve sampling for the graph canvas. Pure: no DOM.

export interface Viewport {
  centerX: number;
  centerY: number;
  unitsPerPixel: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Recursion depth below one sample step (2^-10 of a step at most). */
const MAX_DEPTH = 10;
/** A midpoint within this many pixels of the chord is considered straight. */
const PIXEL_TOLERANCE = 0.3;
/** Average evaluations allowed per base sample; bounds the cost of wild curves. */
const EVALUATIONS_PER_SAMPLE = 24;
const EDGE_BISECTIONS = 14;
/** Rises below this are drawn even if they do not shrink (sub-pixel jitter). */
const JUMP_PIXELS = 2;
const DISCONTINUITY_RATIO = 0.75;
/** Screen coordinates are clamped this far outside the canvas. */
const OVERDRAW = 1e5;

export const defaultViewport = (): Viewport => ({ centerX: 0, centerY: 0, unitsPerPixel: 0.02 });

export function screenToGraph(px: number, py: number, width: number, height: number, view: Viewport): Point {
  return {
    x: view.centerX + (px - width / 2) * view.unitsPerPixel,
    y: view.centerY - (py - height / 2) * view.unitsPerPixel,
  };
}

export function graphToScreen(point: Point, width: number, height: number, view: Viewport): Point {
  return {
    x: width / 2 + (point.x - view.centerX) / view.unitsPerPixel,
    y: height / 2 - (point.y - view.centerY) / view.unitsPerPixel,
  };
}

export function zoomAroundCursor(view: Viewport, cursor: Point, width: number, height: number, factor: number): Viewport {
  const before = screenToGraph(cursor.x, cursor.y, width, height, view);
  const scaled = view.unitsPerPixel * factor;
  const unitsPerPixel = Number.isFinite(scaled)
    ? Math.max(Number.MIN_VALUE, Math.min(Number.MAX_VALUE, scaled))
    : scaled > 0 ? Number.MAX_VALUE : Number.MIN_VALUE;
  const next = { ...view, unitsPerPixel };
  const after = screenToGraph(cursor.x, cursor.y, width, height, next);
  return { unitsPerPixel, centerX: view.centerX + before.x - after.x, centerY: view.centerY + before.y - after.y };
}

export function panViewport(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, centerX: view.centerX - dx * view.unitsPerPixel, centerY: view.centerY + dy * view.unitsPerPixel };
}

export function tickStep(unitsPerPixel: number, targetPixels = 90): number {
  const raw = unitsPerPixel * targetPixels;
  if (!Number.isFinite(raw) || raw <= 0) return Number.MAX_VALUE;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

export function generateTicks(min: number, max: number, step: number, maxTicks = 80): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return [];
  const start = Math.ceil(min / step - 1e-10);
  const end = Math.floor(max / step + 1e-10);
  const stride = Math.max(1, Math.ceil((end - start + 1) / maxTicks));
  const ticks: number[] = [];
  for (let i = start; i <= end; i += stride) {
    const value = i * step;
    if (Number.isFinite(value)) ticks.push(Object.is(value, -0) ? 0 : value);
  }
  return ticks;
}

export function formatTick(value: number): string {
  if (value === 0) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1e6 || absolute < 1e-4) return value.toExponential(2).replace(/\.?0+e/, 'e');
  return Number(value.toPrecision(6)).toString();
}

/**
 * Samples y = f(x) across the viewport and returns polylines in screen space,
 * each a flat [x0, y0, x1, y1, …] array. Samples every `step` pixels, bisects
 * wherever the curve bends by more than PIXEL_TOLERANCE, locates domain edges
 * (e.g. sqrt(x) at 0) by bisection and breaks lines at poles and jumps.
 */
export function sampleCurve(f: (x: number) => number, view: Viewport, width: number, height: number, step = 1): number[][] {
  const units = view.unitsPerPixel;
  const left = view.centerX - (width / 2) * units;
  const middle = height / 2;
  const budget = Math.ceil(width / step + 1) * EVALUATIONS_PER_SAMPLE;
  let evaluations = 0;

  const screenY = (sx: number): number => {
    evaluations += 1;
    const y = f(left + sx * units);
    return Number.isFinite(y) ? middle - (y - view.centerY) / units : Number.NaN;
  };

  const segments: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length >= 4) segments.push(current);
    current = [];
  };
  const push = (sx: number, sy: number) => {
    current.push(sx, Math.max(-OVERDRAW, Math.min(height + OVERDRAW, sy)));
  };
  // Walks from a defined point toward an undefined one; returns the last defined point.
  const edge = (definedX: number, definedY: number, undefinedX: number): [number, number] => {
    for (let i = 0; i < EDGE_BISECTIONS && evaluations < budget; i += 1) {
      const mx = (definedX + undefinedX) / 2;
      const my = screenY(mx);
      if (Number.isNaN(my)) undefinedX = mx;
      else [definedX, definedY] = [mx, my];
    }
    return [definedX, definedY];
  };
  // (x0, y0) is already pushed; pushes interior points only. Halving an
  // interval halves a continuous curve's rise, while a jump or pole keeps it,
  // so a rise that refuses to shrink at full depth marks a discontinuity.
  const refine = (x0: number, y0: number, x1: number, y1: number, depth: number, parentRise: number): void => {
    const rise = Math.abs(y1 - y0);
    if (depth >= MAX_DEPTH || evaluations >= budget) {
      if (rise > JUMP_PIXELS && rise > DISCONTINUITY_RATIO * parentRise) flush();
      return;
    }
    const xm = (x0 + x1) / 2;
    const ym = screenY(xm);
    if (Number.isNaN(ym)) {
      const [ex0, ey0] = edge(x0, y0, xm);
      push(ex0, ey0);
      flush();
      const [ex1, ey1] = edge(x1, y1, xm);
      push(ex1, ey1);
      return;
    }
    if (Math.abs(ym - (y0 + y1) / 2) <= PIXEL_TOLERANCE) return;
    refine(x0, y0, xm, ym, depth + 1, rise);
    push(xm, ym);
    refine(xm, ym, x1, y1, depth + 1, rise);
  };

  let previousX = Number.NaN;
  let previousY = Number.NaN;
  for (let i = 0; ; i += 1) {
    const sx = Math.min(width, i * step);
    const sy = screenY(sx);
    const defined = !Number.isNaN(sy);
    if (i > 0) {
      const wasDefined = !Number.isNaN(previousY);
      if (wasDefined && defined) {
        refine(previousX, previousY, sx, sy, 0, Number.POSITIVE_INFINITY);
      } else if (wasDefined) {
        const [ex, ey] = edge(previousX, previousY, sx);
        push(ex, ey);
        flush();
      } else if (defined) {
        const [ex, ey] = edge(sx, sy, previousX);
        push(ex, ey);
      }
    }
    if (defined) push(sx, sy);
    previousX = sx;
    previousY = sy;
    if (sx >= width) break;
  }
  flush();
  return segments;
}
