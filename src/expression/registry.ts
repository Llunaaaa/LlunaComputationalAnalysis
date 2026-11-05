import { gcd, isInteger, permutations, choose, realRoot } from './numeric.ts';

const PHI = (1 + Math.sqrt(5)) / 2;

export const CONSTANTS = new Map<string, number>([
  ['pi', Math.PI], ['π', Math.PI], ['e', Math.E], ['phi', PHI], ['ϕ', PHI], ['φ', PHI],
]);

export const INFINITY_NAMES = new Set(['infinity', 'inf', 'oo']);

export interface FunctionSpec {
  min: number;
  max: number;
  apply: (args: number[]) => number;
}

const unary = (f: (x: number) => number): FunctionSpec => ({ min: 1, max: 1, apply: (a) => f(a[0]) });
const binary = (f: (a: number, b: number) => number): FunctionSpec => ({ min: 2, max: 2, apply: (a) => f(a[0], a[1]) });

export const FUNCTIONS = new Map<string, FunctionSpec>([
  ['sqrt', unary(Math.sqrt)],
  ['root', binary((n, x) => realRoot(x, n))],
  ['log', { min: 1, max: 2, apply: (a) => (a.length === 1 ? Math.log10(a[0]) : Math.log(a[1]) / Math.log(a[0])) }],
  ['ln', unary(Math.log)],
  ['exp', unary(Math.exp)],
  ['abs', unary(Math.abs)],
  ['sin', unary(Math.sin)],
  ['cos', unary(Math.cos)],
  ['tan', unary(Math.tan)],
  ['asin', unary(Math.asin)],
  ['acos', unary(Math.acos)],
  ['atan', unary(Math.atan)],
  ['gcd', binary((a, b) => (isInteger(a) && isInteger(b) ? gcd(Math.abs(a), Math.abs(b)) : NaN))],
  ['lcm', binary((a, b) => (isInteger(a) && isInteger(b) ? (a === 0 || b === 0 ? 0 : Math.abs(a / gcd(Math.abs(a), Math.abs(b)) * b)) : NaN))],
  ['mod', binary((a, b) => (b === 0 ? NaN : a - b * Math.floor(a / b)))],
  ['nCr', binary(choose)],
  ['comb', binary(choose)],
  ['nPr', binary(permutations)],
  ['perm', binary(permutations)],
]);

export function arityMessage(name: string, spec: FunctionSpec): string {
  if (spec.min === spec.max) return `${name} requires exactly ${spec.min} argument${spec.min === 1 ? '' : 's'}`;
  return `${name} requires ${spec.min} or ${spec.max} arguments`;
}

export function isReservedName(name: string): boolean {
  return CONSTANTS.has(name) || FUNCTIONS.has(name) || INFINITY_NAMES.has(name) ||
    ['sum', 'prod', 'integral', 'int', 'derivative', 'diff', 'derivative_n', 'diff_n', 'limit', 'left', 'right'].includes(name);
}
