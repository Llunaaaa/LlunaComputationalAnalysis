import type { Env, Fn, Node, Program } from './types.ts';
import { tokenize, type Token, type TokenType } from './tokenizer.ts';
import { CONSTANTS, FUNCTIONS, INFINITY_NAMES, arityMessage, type FunctionSpec } from './registry.ts';
import { MAX_ITERATIONS, differentiate, factorial, integrate, isInteger, numericLimit, realPow } from './numeric.ts';

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


/**
 * Compiles an engine-language expression. `globals` name the leading env
 * slots (e.g. ['x', 'a', 'g']); any other identifier must be a constant,
 * function, calculus variable, or a juxtaposition of those.
 */
export function compileExpression(text: string, globals: readonly string[] = []): Program {
  return new Compiler(tokenize(text), globals).compile();
}