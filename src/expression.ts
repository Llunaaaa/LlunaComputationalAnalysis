// Compiles engine-language text (the output of latexConverter) into a fast
// double-precision evaluator for graphing. The grammar, identifier splitting
// and scoping rules mirror engine/core/parser.hpp so a row that graphs also
// evaluates in the Arithmetic section, and vice versa.
//
// Compilation happens once per source; evaluation reads variables from a
// Float64Array of slots, so slider changes never recompile anything.

export type Env = Float64Array;
type Fn = (env: Env) => number;

interface Node {
  fn: Fn;
  // Slots the value depends on; empty means it was folded at compile time.
  deps: readonly number[];
}

export interface Program {
  evaluate: Fn;
  // Slots required by evaluate: the globals first, then bound variables.
  slotCount: number;
  // Globals actually referenced (for dependency tracking).
  uses: ReadonlySet<string>;
}

type TokenType = 'num' | 'id' | 'inf' | 'deg' | 'op' | 'eof';
interface Token { type: TokenType; text: string; value: number }

const MAX_ITERATIONS = 1_000_000;
const PHI = (1 + Math.sqrt(5)) / 2;
const CONSTANTS = new Map<string, number>([
  ['pi', Math.PI], ['π', Math.PI], ['e', Math.E], ['phi', PHI], ['ϕ', PHI], ['φ', PHI],
]);
const INFINITY_NAMES = new Set(['infinity', 'inf', 'oo']);

interface FunctionSpec { min: number; max: number; apply: (args: number[]) => number }

const unary = (f: (x: number) => number): FunctionSpec => ({ min: 1, max: 1, apply: (a) => f(a[0]) });
const binary = (f: (a: number, b: number) => number): FunctionSpec => ({ min: 2, max: 2, apply: (a) => f(a[0], a[1]) });

const FUNCTIONS = new Map<string, FunctionSpec>([
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

function arityMessage(name: string, spec: FunctionSpec): string {
  if (spec.min === spec.max) return `${name} requires exactly ${spec.min} argument${spec.min === 1 ? '' : 's'}`;
  return `${name} requires ${spec.min} or ${spec.max} arguments`;
}

const isInteger = (x: number) => Number.isInteger(x);

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function choose(n: number, k: number): number {
  if (!isInteger(n) || !isInteger(k) || n < 0 || k < 0 || k > n) return NaN;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

function permutations(n: number, k: number): number {
  if (!isInteger(n) || !isInteger(k) || n < 0 || k < 0 || k > n) return NaN;
  let result = 1;
  for (let i = 0; i < k; i += 1) result *= n - i;
  return result;
}

// Odd roots of negatives are real: root(3, -8) = -2.
function realRoot(x: number, n: number): number {
  if (x >= 0) return Math.pow(x, 1 / n);
  return isInteger(n) && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : NaN;
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

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*|[πϕφ])|(∞)|(°)|([-+*/^!()|,=]))/y;
  let position = 0;
  while (position < text.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (!match) {
      if (/^\s*$/.test(text.slice(position))) break;
      throw new Error('Unexpected character in expression');
    }
    position = pattern.lastIndex;
    if (match[1] !== undefined) {
      const value = Number(match[1]);
      if (!Number.isFinite(value)) throw new Error('The number is not finite');
      tokens.push({ type: 'num', text: match[1], value });
    } else if (match[2] !== undefined) tokens.push({ type: 'id', text: match[2], value: 0 });
    else if (match[3] !== undefined) tokens.push({ type: 'inf', text: 'infinity', value: 0 });
    else if (match[4] !== undefined) tokens.push({ type: 'deg', text: '°', value: 0 });
    else tokens.push({ type: 'op', text: match[5], value: 0 });
  }
  tokens.push({ type: 'eof', text: '', value: 0 });
  return tokens;
}

const constant = (value: number): Node => ({ fn: () => value, deps: [] });
const isConstant = (node: Node) => node.deps.length === 0;
const valueOf = (node: Node) => node.fn(new Float64Array(0));

class Compiler {
  private pos = 0;
  private openPipes = 0;
  private slotCount: number;
  // Innermost binding last; globals occupy the first slots.
  private readonly scope: { name: string; slot: number }[];
  readonly uses = new Set<string>();
  private readonly tokens: Token[];
  private readonly globals: readonly string[];

  constructor(tokens: Token[], globals: readonly string[]) {
    this.tokens = tokens;
    this.globals = globals;
    this.scope = globals.map((name, slot) => ({ name, slot }));
    this.slotCount = globals.length;
  }

  compile(): Program {
    if (this.check('eof')) throw new Error('Enter an expression');
    const node = this.expression();
    if (!this.check('eof')) throw new Error('Unexpected character in expression');
    return { evaluate: node.fn, slotCount: this.slotCount, uses: this.uses };
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private check(type: TokenType, text?: string): boolean {
    const token = this.peek();
    return token.type === type && (text === undefined || token.text === text);
  }

  private match(type: TokenType, text?: string): boolean {
    if (!this.check(type, text)) return false;
    this.pos += 1;
    return true;
  }

  private consume(type: TokenType, text: string | undefined, message: string): Token {
    if (!this.check(type, text)) throw new Error(message);
    return this.tokens[this.pos++];
  }

  private lookup(name: string): number | undefined {
    for (let i = this.scope.length - 1; i >= 0; i -= 1) {
      if (this.scope[i].name === name) {
        if (i < this.globals.length) this.uses.add(name);
        return this.scope[i].slot;
      }
    }
    return undefined;
  }

  private isBound(name: string): boolean {
    return this.scope.some((entry) => entry.name === name);
  }

  // A node over children; folded to a constant when it depends on no slot
  // other than `bound` (the variable a sum/integral/limit binds itself).
  private combine(children: readonly Node[], fn: Fn, bound = -1, extra: readonly number[] = []): Node {
    const deps = new Set<number>(extra);
    for (const child of children) for (const slot of child.deps) if (slot !== bound) deps.add(slot);
    if (deps.size === 0) return constant(fn(new Float64Array(this.slotCount)));
    return { fn, deps: [...deps] };
  }

  private read(slot: number): Node {
    return { fn: (env) => env[slot], deps: [slot] };
  }

  // Binds a name to a fresh slot while body() is compiled.
  private bind<T>(name: string, body: (slot: number) => T): T {
    const slot = this.slotCount++;
    this.scope.push({ name, slot });
    try {
      return body(slot);
    } finally {
      this.scope.pop();
    }
  }

  private expression(): Node {
    let left = this.term();
    while (this.check('op', '+') || this.check('op', '-')) {
      const op = this.tokens[this.pos++].text;
      const a = left.fn;
      const b = this.term();
      const bf = b.fn;
      left = this.combine([left, b], op === '+' ? (env) => a(env) + bf(env) : (env) => a(env) - bf(env));
    }
    return left;
  }

  private term(): Node {
    let left = this.unary();
    for (;;) {
      let op: string;
      if (this.check('op', '*') || this.check('op', '/')) op = this.tokens[this.pos++].text;
      else if (this.canStartPrimary()) op = '*';
      else return left;
      const a = left.fn;
      const b = this.unary();
      const bf = b.fn;
      left = this.combine([left, b], op === '*' ? (env) => a(env) * bf(env) : (env) => a(env) / bf(env));
    }
  }

  private unary(): Node {
    if (this.match('op', '+')) return this.unary();
    if (this.match('op', '-')) {
      if (this.match('inf')) return constant(-Infinity);
      if (this.check('id') && INFINITY_NAMES.has(this.peek().text) && !this.isBound(this.peek().text)) {
        this.pos += 1;
        return constant(-Infinity);
      }
      const child = this.power();
      const f = child.fn;
      return this.combine([child], (env) => -f(env));
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (!this.match('op', '^')) return base;
    const exponent = this.unary();
    const b = base.fn;
    const e = exponent.fn;
    if (isConstant(exponent)) {
      const value = valueOf(exponent);
      if (value === 2) return this.combine([base], (env) => { const v = b(env); return v * v; });
      return this.combine([base], (env) => realPow(b(env), value));
    }
    return this.combine([base, exponent], (env) => realPow(b(env), e(env)));
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.match('op', '!')) {
        const f = node.fn;
        node = this.combine([node], (env) => factorial(f(env)));
      } else if (this.match('deg')) {
        const f = node.fn;
        node = this.combine([node], (env) => f(env) * (Math.PI / 180));
      } else {
        return node;
      }
    }
  }

  private primary(): Node {
    const token = this.peek();
    if (this.match('num')) return constant(token.value);
    if (this.match('inf')) return constant(Infinity);
    if (this.match('op', '(')) {
      const inner = this.expression();
      this.consume('op', ')', 'Missing closing parenthesis');
      return inner;
    }
    if (this.match('op', '|')) {
      this.openPipes += 1;
      const inner = this.expression();
      this.consume('op', '|', 'Missing closing pipe for absolute value');
      this.openPipes -= 1;
      const f = inner.fn;
      return this.combine([inner], (env) => Math.abs(f(env)));
    }
    if (this.match('id')) return this.identifier(token.text);
    throw new Error('Expected a number');
  }

  private canStartPrimary(): boolean {
    const token = this.peek();
    if (token.type === 'num' || token.type === 'id' || token.type === 'inf') return true;
    if (token.type !== 'op') return false;
    return token.text === '(' || (token.text === '|' && this.openPipes === 0);
  }

  private identifier(name: string): Node {
    const slot = this.lookup(name);
    if (slot !== undefined) return this.read(slot);
    if (INFINITY_NAMES.has(name)) return constant(Infinity);
    if (name === 'integral' || name === 'int') return this.integral();
    if (name === 'derivative' || name === 'diff') return this.derivative(false);
    if (name === 'derivative_n' || name === 'diff_n') return this.derivative(true);
    if (name === 'limit') return this.limit();
    if (name === 'sum' || name === 'prod') return this.iteration(name);
    const value = CONSTANTS.get(name);
    if (value !== undefined) return constant(value);
    const spec = FUNCTIONS.get(name);
    if (spec) return this.call(name, spec);
    return this.split(name);
  }

  private call(name: string, spec: FunctionSpec): Node {
    this.consume('op', '(', `${name} requires an expression in parentheses`);
    const args = this.argumentList();
    if (this.match('op', '(')) args.push(...this.argumentList());
    if (args.length < spec.min || args.length > spec.max) throw new Error(arityMessage(name, spec));
    const fns = args.map((arg) => arg.fn);
    const apply = spec.apply;
    if (fns.length === 1) {
      const f = fns[0];
      const single = [0];
      return this.combine(args, (env) => { single[0] = f(env); return apply(single); });
    }
    const values = new Array<number>(fns.length);
    return this.combine(args, (env) => {
      for (let i = 0; i < fns.length; i += 1) values[i] = fns[i](env);
      return apply(values);
    });
  }

  private argumentList(): Node[] {
    const args = [this.expression()];
    while (this.match('op', ',')) args.push(this.expression());
    this.consume('op', ')', 'Missing closing parenthesis');
    return args;
  }

  // Same rule as the native split_identifier: fewest known atoms.
  private split(name: string): Node {
    const n = name.length;
    const callFollows = this.check('op', '(');
    const atoms = new Array<number>(n + 1).fill(Infinity);
    const next = new Array<number>(n + 1).fill(0);
    atoms[n] = 0;
    for (let start = n - 1; start >= 0; start -= 1) {
      for (let end = n; end > start; end -= 1) {
        if (atoms[end] === Infinity) continue;
        const part = name.slice(start, end);
        const known = this.isBound(part) || CONSTANTS.has(part) || (end === n && callFollows && FUNCTIONS.has(part));
        if (known && atoms[end] + 1 < atoms[start]) {
          atoms[start] = atoms[end] + 1;
          next[start] = end;
        }
      }
    }
    if (atoms[0] === Infinity || atoms[0] < 2) throw new Error(`Unknown identifier: ${name}`);

    let product: Node | null = null;
    for (let start = 0; start < n; start = next[start]) {
      const part = name.slice(start, next[start]);
      let factor: Node;
      const slot = this.lookup(part);
      if (slot !== undefined) factor = this.read(slot);
      else if (CONSTANTS.has(part)) factor = constant(CONSTANTS.get(part)!);
      else factor = this.call(part, FUNCTIONS.get(part)!);
      if (product) {
        const a = product.fn;
        const b = factor.fn;
        product = this.combine([product, factor], (env) => a(env) * b(env));
      } else {
        product = factor;
      }
    }
    return product!;
  }

  private optionalVariable(fallback: string, allowConstants = false): string {
    const token = this.peek();
    if (token.type === 'id' && this.peek(1).type === 'op' && this.peek(1).text === ',') {
      if (allowConstants || !CONSTANTS.has(token.text) || this.isBound(token.text)) {
        this.pos += 2;
        return token.text;
      }
    }
    return fallback;
  }

  // integral(lower, upper, [variable,] integrand) by adaptive Simpson.
  private integral(): Node {
    this.consume('op', '(', 'Integral requires arguments in parentheses: integral(lower, upper, variable, integrand)');
    const lower = this.expression();
    this.consume('op', ',', "Expected ',' after integral lower bound");
    const upper = this.expression();
    this.consume('op', ',', "Expected ',' after integral upper bound");
    const variable = this.optionalVariable('x', true);
    return this.bind(variable, (slot) => {
      const body = this.expression();
      this.consume('op', ')', 'Missing closing parenthesis in integral');
      const lo = lower.fn;
      const hi = upper.fn;
      const f = body.fn;
      return this.combine([lower, upper, body], (env) => {
        const a = lo(env);
        const b = hi(env);
        if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) > 1e7) return NaN;
        if (a === b) return 0;
        const sample = (x: number) => { env[slot] = x; return f(env); };
        return integrate(sample, a, b);
      }, slot);
    });
  }

  // derivative([variable,] [point,] body) and derivative_n(order, [variable,] [point,] body)
  private derivative(withOrder: boolean): Node {
    this.consume('op', '(', withOrder
      ? 'Derivative requires arguments in parentheses: derivative_n(order, variable, point, body)'
      : 'Derivative requires arguments in parentheses: derivative(variable, point, body)');
    let order = 1;
    if (withOrder) {
      const node = this.expression();
      if (!isConstant(node)) throw new Error('Derivative order must be an integer');
      order = valueOf(node);
      if (!isInteger(order)) throw new Error('Derivative order must be an integer');
      this.consume('op', ',', "Expected ',' after derivative order");
    }
    if (order < 1 || order > 10) throw new Error('Derivative order must be between 1 and 10');
    const variable = this.optionalVariable('x');
    // With no explicit point the derivative is taken at the variable's outer
    // value, so derivative(x, f(x)) graphs as f'(x).
    const outer = this.lookup(variable);
    return this.bind(variable, (slot) => {
      let body = this.expression();
      let point: Node | null = null;
      if (this.match('op', ',')) {
        point = body;
        body = this.expression();
      }
      this.consume('op', ')', 'Missing closing parenthesis in derivative');
      const f = body.fn;
      const at = point ? point.fn : outer !== undefined ? (env: Env) => env[outer] : () => 0;
      const children = point ? [point, body] : [body];
      const extra = !point && outer !== undefined ? [outer] : [];
      return this.combine(children, (env) => {
        const x = at(env);
        return differentiate((t) => { env[slot] = t; return f(env); }, x, order);
      }, slot, extra);
    });
  }

  // limit([variable,] target, [left | right,] body)
  private limit(): Node {
    this.consume('op', '(', 'Limit requires arguments in parentheses: limit(variable, target, body)');
    const variable = this.optionalVariable('x');
    const target = this.expression();
    this.consume('op', ',', "Expected ',' after limit target");
    let side = 0;
    if (this.check('id') && (this.peek().text === 'left' || this.peek().text === 'right') &&
        this.peek(1).type === 'op' && this.peek(1).text === ',') {
      side = this.peek().text === 'left' ? -1 : 1;
      this.pos += 2;
    }
    return this.bind(variable, (slot) => {
      const body = this.expression();
      this.consume('op', ')', 'Missing closing parenthesis in limit');
      const c = target.fn;
      const f = body.fn;
      return this.combine([target, body], (env) => numericLimit((t) => { env[slot] = t; return f(env); }, c(env), side), slot);
    });
  }

  // sum(i, lower, upper, body) or sum(i, lower, upper)(body); likewise prod.
  private iteration(name: 'sum' | 'prod'): Node {
    this.consume('op', '(', `${name} requires arguments in parentheses`);
    const variable = this.consume('id', undefined, `${name} requires an index variable`).text;
    this.consume('op', ',', `Expected ',' after variable name in ${name}`);
    const lower = this.expression();
    this.consume('op', ',', `Expected ',' after lower bound in ${name}`);
    const upper = this.expression();
    const parenthesised = !this.match('op', ',');
    if (parenthesised) {
      this.consume('op', ')', `Missing closing parenthesis in ${name}`);
      this.consume('op', '(', `${name} requires target expression in parentheses`);
    }
    return this.bind(variable, (slot) => {
      const body = this.expression();
      this.consume('op', ')', parenthesised
        ? `Missing closing parenthesis around target expression in ${name}`
        : `Missing closing parenthesis in ${name}`);
      for (const bound of [lower, upper]) {
        if (isConstant(bound)) {
          const value = valueOf(bound);
          if (!Number.isFinite(value)) throw new Error('Infinite bounds are not supported');
          if (!isInteger(value)) throw new Error(bound === lower ? 'Lower bound must be an integer' : 'Upper bound must be an integer');
        }
      }
      if (isConstant(lower) && isConstant(upper)) {
        const a = valueOf(lower);
        const b = valueOf(upper);
        if (a > b) throw new Error('Lower bound cannot be greater than upper bound');
        if (b - a > MAX_ITERATIONS) throw new Error('Operation requires an unreasonable amount of computational power');
      }
      const lo = lower.fn;
      const hi = upper.fn;
      const f = body.fn;
      const isSum = name === 'sum';
      return this.combine([lower, upper, body], (env) => {
        const a = lo(env);
        const b = hi(env);
        if (!isInteger(a) || !isInteger(b) || a > b || b - a > MAX_ITERATIONS) return NaN;
        let total = isSum ? 0 : 1;
        for (let i = a; i <= b; i += 1) {
          env[slot] = i;
          total = isSum ? total + f(env) : total * f(env);
        }
        return total;
      }, slot);
    });
  }
}

// Adaptive Simpson with the same tolerance as the native engine.
function integrate(f: (x: number) => number, a: number, b: number): number {
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
function differentiate(f: (x: number) => number, x: number, order: number): number {
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
function numericLimit(f: (x: number) => number, c: number, side: number): number {
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

/**
 * Compiles an engine-language expression. `globals` name the leading env
 * slots (e.g. ['x', 'a', 'g']); any other identifier must be a constant,
 * function, calculus variable, or a juxtaposition of those.
 */
export function compileExpression(text: string, globals: readonly string[] = []): Program {
  return new Compiler(tokenize(text), globals).compile();
}

export function isReservedName(name: string): boolean {
  return CONSTANTS.has(name) || FUNCTIONS.has(name) || INFINITY_NAMES.has(name) ||
    ['sum', 'prod', 'integral', 'int', 'derivative', 'diff', 'derivative_n', 'diff_n', 'limit', 'left', 'right'].includes(name);
}
