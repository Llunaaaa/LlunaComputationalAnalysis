export const isInteger = (x: number) => Number.isInteger(x);

export const MAX_ITERATIONS = 1_000_000;

// Odd roots of negatives are real: root(3, -8) = -2.
export function realRoot(x: number, n: number): number {
  if (x >= 0) return Math.pow(x, 1 / n);
  return isInteger(n) && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : NaN;
}

export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function choose(n: number, k: number): number {
  if (!isInteger(n) || !isInteger(k) || n < 0 || k < 0 || k > n) return NaN;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

export function permutations(n: number, k: number): number {
  if (!isInteger(n) || !isInteger(k) || n < 0 || k < 0 || k > n) return NaN;
  let result = 1;
  for (let i = 0; i < k; i += 1) result *= n - i;
  return result;
}

// Real power: a negative base with a rational exponent p/q (q odd) is real,
// so x^(1/3) and x^(2/3) graph on both sides of the axis.
export function realPow(base: number, exponent: number): number {
  if (base >= 0 || isInteger(exponent) || !Number.isFinite(exponent)) return Math.pow(base, exponent);
  for (let q = 3; q <= 99; q += 2) {
    const p = Math.round(exponent * q);
    if (Math.abs(exponent * q - p) < 1e-9) {
      const magnitude = Math.pow(-base, exponent);
      return p % 2 === 0 ? magnitude : -magnitude;
    }
  }
  return NaN;
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i += 1) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

const FACTORIALS: number[] = [1];
for (let n = 1; n <= 170; n += 1) FACTORIALS.push(FACTORIALS[n - 1] * n);

export function factorial(x: number): number {
  if (isInteger(x)) return x < 0 ? NaN : x <= 170 ? FACTORIALS[x] : Infinity;
  return x > 171 ? Infinity : gamma(x + 1);
}
export function integrate(f: (x: number) => number, a: number, b: number): number {
  const simpson = (l: number, r: number, fl: number, fm: number, fr: number) => ((r - l) * (fl + 4 * fm + fr)) / 6;
  const recurse = (l: number, r: number, fl: number, fm: number, fr: number, whole: number, depth: number): number => {
    const m = (l + r) / 2;
    const flm = f((l + m) / 2);
    const frm = f((m + r) / 2);
    const left = simpson(l, m, fl, flm, fm);
    const right = simpson(m, r, fm, frm, fr);
    const refined = left + right;
    const error = refined - whole;
    if (depth <= 0 || !Number.isFinite(refined) || Math.abs(error) <= 15e-10 * (1 + Math.abs(refined))) return refined + error / 15;
    return recurse(l, m, fl, flm, fm, left, depth - 1) + recurse(m, r, fm, frm, fr, right, depth - 1);
  };
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const fl = f(lo);
  const fm = f((lo + hi) / 2);
  const fr = f(hi);
  const area = recurse(lo, hi, fl, fm, fr, simpson(lo, hi, fl, fm, fr), 18);
  return b >= a ? area : -area;
}

// Ridders' extrapolation of the centered n-th difference (as in the engine).
export function differentiate(f: (x: number) => number, x: number, order: number): number {
  const table = 8;
  const shrink = 1.4;
  const difference = (h: number) => {
    let sum = 0;
    let binomial = 1;
    for (let k = 0; k <= order; k += 1) {
      sum += (k % 2 === 0 ? binomial : -binomial) * f(x + (order / 2 - k) * h);
      binomial = (binomial * (order - k)) / (k + 1);
    }
    return sum / Math.pow(h, order);
  };
  let h = Math.min(1, 0.1 * order) * Math.max(1, Math.abs(x));
  const a: number[][] = [[difference(h)]];
  let best = a[0][0];
  let bestError = Infinity;
  for (let i = 1; i < table; i += 1) {
    h /= shrink;
    a.push([difference(h)]);
    let factor = shrink * shrink;
    for (let j = 1; j <= i; j += 1) {
      a[i][j] = (a[i][j - 1] * factor - a[i - 1][j - 1]) / (factor - 1);
      factor *= shrink * shrink;
      const error = Math.max(Math.abs(a[i][j] - a[i][j - 1]), Math.abs(a[i][j] - a[i - 1][j - 1]));
      if (error <= bestError) {
        bestError = error;
        best = a[i][j];
      }
    }
    if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * bestError) break;
  }
  return best;
}

// One-sided Richardson extrapolation of f(c ? h); two-sided limits must agree.
export function numericLimit(f: (x: number) => number, c: number, side: number): number {
  const approach = (direction: number): { value: number; error: number } => {
    const at = Number.isFinite(c)
      ? (h: number) => f(c + direction * h * Math.max(1, Math.abs(c)))
      : (h: number) => f(c > 0 ? 1 / h : -1 / h);
    const samples: number[] = [];
    for (let k = 1; k <= 40; k += 1) samples.push(at(0.1 / 2 ** k));
    const last = samples[samples.length - 1];
    if (!Number.isFinite(last)) return { value: last, error: 0 };
    const growing = samples.slice(-6).every((value, i, all) => i === 0 || Math.abs(value) > Math.abs(all[i - 1]) * 1.5);
    if (growing && Math.abs(last) > 1e6) return { value: last > 0 ? Infinity : -Infinity, error: 0 };
    // First-order Richardson on the halving sequence removes the O(h) term.
    // Scan only while the extrapolants keep settling: once their differences
    // grow, roundoff dominates and later agreement is coincidence.
    let best = NaN;
    let bestError = Infinity;
    let previous = NaN;
    for (let k = 1; k < samples.length; k += 1) {
      const estimate = 2 * samples[k] - samples[k - 1];
      const error = Math.abs(estimate - previous);
      previous = estimate;
      if (!Number.isFinite(error)) continue;
      if (error <= bestError) {
        bestError = error;
        best = estimate;
      } else if (error > 8 * bestError && bestError < 1e-3 * Math.max(1, Math.abs(best))) {
        break;
      }
    }
    if (!Number.isFinite(best)) return { value: NaN, error: Infinity };
    const nearest = Math.round(best);
    const value = Math.abs(best - nearest) <= Math.max(2 * bestError, 1e-10) ? nearest : best;
    return { value, error: bestError };
  };
  if (side !== 0 || !Number.isFinite(c)) return approach(side === 0 ? 1 : side).value;
  const left = approach(-1);
  const right = approach(1);
  if (left.value === right.value) return left.value;
  const tolerance = Math.max(1e-9 * Math.max(1, Math.abs(left.value)), 4 * (left.error + right.error));
  return Math.abs(left.value - right.value) <= tolerance ? (left.value + right.value) / 2 : NaN;
}