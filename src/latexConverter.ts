// Converts MathLive LaTeX into the plain expression language shared by the
// native engine and the graph compiler (src/expression.ts).
//
// The converter is a tokenizer plus a recursive-descent walk. It only decides
// structure that LaTeX leaves implicit (operator extents, differentials,
// function arguments, abs bars); precedence is left to the engine grammar.

type Token = { kind: 'cmd' | 'chr'; value: string };

export const PLACEHOLDER_ERROR = 'Please fill in all placeholders in the expression';

const UNICODE_COMMANDS: Record<string, string> = {
  'π': 'pi', 'ϕ': 'phi', 'φ': 'phi', '∞': 'infty', '°': 'degree',
  '·': 'cdot', '×': 'times', '÷': 'div', '−': '-', '→': 'to',
};

const SPACING = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle', 'limits', 'nolimits', 'mathstrut', 'enspace', 'thinspace']);
const TEXT_WRAPPERS = new Set(['operatorname', 'mathrm', 'text', 'textrm', 'mathit', 'mathbf', 'mathsf', 'textit', 'textbf', 'mathnormal']);
const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);
// Commands that name engine functions; the value is the engine name.
const FUNCTIONS = new Map([
  ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['arcsin', 'asin'], ['arccos', 'acos'], ['arctan', 'atan'],
  ['ln', 'ln'], ['log', 'log'], ['exp', 'exp'], ['gcd', 'gcd'], ['lcm', 'lcm'],
  ['sec', 'sec'], ['csc', 'csc'], ['cot', 'cot'],
]);
const INVERSE_TRIG = new Map([['sin', 'asin'], ['cos', 'acos'], ['tan', 'atan']]);
// Reciprocal trig as numerator / denominator function ('' means 1).
const RECIPROCAL_TRIG = new Map([['sec', ['', 'cos']], ['csc', ['', 'sin']], ['cot', ['cos', 'sin']]]);
// Multi-letter names that typed letters may legitimately spell as one word.
const ENGINE_WORDS = new Set([
  'pi', 'phi', 'e', 'ans', 'infinity', 'inf', 'oo',
  'sqrt', 'root', 'log', 'ln', 'exp', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'gcd', 'lcm', 'mod', 'nCr', 'comb', 'nPr', 'perm',
  'sum', 'prod', 'integral', 'int', 'derivative', 'diff', 'limit',
]);
const OPERATORS = new Map([['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['=', '='], [',', ',']]);
const OPERATOR_COMMANDS = new Map([['cdot', '*'], ['times', '*'], ['ast', '*'], ['div', '/']]);
const ARROWS = new Set(['to', 'rightarrow', 'longrightarrow', 'Rightarrow']);

function tokenize(latex: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];
    if (/\s/.test(ch) || ch === '~') continue;
    if (ch === '\\') {
      let end = i + 1;
      while (end < latex.length && /[a-zA-Z]/.test(latex[end])) end += 1;
      if (end === i + 1) end = Math.min(latex.length, i + 2);
      tokens.push({ kind: 'cmd', value: latex.slice(i + 1, end) });
      i = end - 1;
      continue;
    }
    const mapped = UNICODE_COMMANDS[ch];
    if (mapped === '-') tokens.push({ kind: 'chr', value: '-' });
    else if (mapped) tokens.push({ kind: 'cmd', value: mapped });
    else tokens.push({ kind: 'chr', value: ch });
  }
  return tokens;
}

const isLetter = (token: Token | undefined) => token?.kind === 'chr' && /^[a-zA-Z]$/.test(token.value);
const isDigit = (token: Token | undefined) => token?.kind === 'chr' && /^[0-9.]$/.test(token.value);
const isChar = (token: Token | undefined, value: string) => token?.kind === 'chr' && token.value === value;
const isCmd = (token: Token | undefined, value: string) => token?.kind === 'cmd' && token.value === value;
const wrap = (text: string) => `(${text})`;

interface TermOptions {
  // Stop at top-level + - = , (operator bodies such as sums and limits).
  additive?: boolean;
  // Stop at explicit operators and at the next function (implicit arguments: \sin 2x).
  implicitArgument?: boolean;
}

class Converter {
  private pos = 0;
  // One entry per open group; true when a bare '|' closes that group.
  private readonly bars: boolean[] = [false];
  // Group depths at which an integral is looking for its differential.
  private readonly integrals: number[] = [];
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  convert(): string {
    const parts: string[] = [];
    while (this.pos < this.tokens.length) {
      parts.push(this.sequence({}));
      const stray = this.tokens[this.pos];
      if (stray) {
        // Unbalanced closer: pass it through so the engine reports it.
        parts.push(stray.kind === 'cmd' ? ')' : stray.value);
        this.pos += 1;
      }
    }
    return parts.filter(Boolean).join(' ');
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private skipSpacing() {
    while (this.peek()?.kind === 'cmd' && SPACING.has(this.peek()!.value)) this.pos += 1;
  }

  private isCloser(token: Token | undefined): boolean {
    if (!token) return true;
    const bar = token.kind === 'cmd' ? token.value === 'vert' || token.value === 'rvert' : token.value === '|';
    if (bar) return this.bars[this.bars.length - 1];
    if (token.kind === 'cmd') return token.value === 'right';
    return token.value === ')' || token.value === ']' || token.value === '}';
  }

  private atDifferential(): boolean {
    if (this.integrals[this.integrals.length - 1] !== this.bars.length) return false;
    const width = this.differentialWidth(this.pos);
    return width > 0 && this.variableAt(this.pos + width) !== null;
  }

  // Width of a "d" marker at index: d, \mathrm{d}, \operatorname{d}, \differentialD.
  private differentialWidth(index: number): number {
    const token = this.tokens[index];
    if (isChar(token, 'd')) return 1;
    if (isCmd(token, 'differentialD') || isCmd(token, 'partial')) return 1;
    if (token?.kind === 'cmd' && TEXT_WRAPPERS.has(token.value) &&
        isChar(this.tokens[index + 1], '{') && isChar(this.tokens[index + 2], 'd') && isChar(this.tokens[index + 3], '}')) {
      return 4;
    }
    return 0;
  }

  private variableAt(index: number): string | null {
    const token = this.tokens[index];
    if (isLetter(token)) return token!.value;
    if (token?.kind === 'cmd' && GREEK.has(token.value)) return token.value;
    return null;
  }

  // A run of items up to a closer (or a stop condition from the options).
  private sequence(options: TermOptions): string {
    const parts: string[] = [];
    for (;;) {
      this.skipSpacing();
      const token = this.peek();
      if (this.isCloser(token) || this.atDifferential()) break;
      const operator = (token!.kind === 'chr' ? OPERATORS : OPERATOR_COMMANDS).get(token!.value);
      if (operator) {
        const unarySign = parts.length === 0 && (operator === '+' || operator === '-');
        if (options.implicitArgument && !unarySign) break;
        if (options.additive && !unarySign && (operator === '+' || operator === '-' || operator === '=' || operator === ',')) break;
        parts.push(operator);
        this.pos += 1;
        continue;
      }
      if (options.implicitArgument && parts.length > 0 && this.startsOperator(token!)) break;
      parts.push(this.atom());
    }
    return parts.join(' ');
  }

  // Tokens that begin a new function application or big operator.
  private startsOperator(token: Token): boolean {
    if (token.kind !== 'cmd') return false;
    return FUNCTIONS.has(token.value) || ['sum', 'prod', 'int', 'lim', 'sqrt'].includes(token.value);
  }

  private atom(): string {
    const token = this.next()!;
    if (token.kind === 'chr') {
      if (isDigit(token)) return this.postfix(this.number(token.value));
      if (isLetter(token)) return this.word(token.value);
      if (token.value === '(' || token.value === '[') return this.postfix(wrap(this.group(false)));
      if (token.value === '{') return this.postfix(wrap(this.group(false)));
      if (token.value === '|') return this.postfix(`(abs(${this.group(true)}))`);
      if (token.value === '!') return '!';
      if (token.value === '^' || token.value === '_') throw new Error('A superscript or subscript is missing its base');
      throw new Error(`Unsupported character: ${token.value}`);
    }
    return this.command(token.value);
  }

  private number(first: string): string {
    let text = first;
    while (isDigit(this.peek())) text += this.next()!.value;
    if (text === '.' || (text.match(/\./g) ?? []).length > 1) throw new Error(`Invalid number: ${text}`);
    return text.startsWith('.') ? `0${text}` : text;
  }

  // Consecutive letters form one word so the engine can split it with full
  // knowledge of bound variables ("xg" -> x*g, "pie" -> pi*e, "nCr" stays).
  private word(first: string): string {
    let word = first;
    while (isLetter(this.peek()) && !this.atDifferential()) word += this.next()!.value;
    const pieces: string[] = [];
    if (this.peekScript('_')) {
      pieces.push(word.slice(0, -1));
      word = `${word.slice(-1)}_${this.subscript()}`;
    } else if (word.length > 1 && !ENGINE_WORDS.has(word) && this.peekPostfix()) {
      // In "xy^2" only the y is squared.
      pieces.push(word.slice(0, -1));
      word = word.slice(-1);
    }
    pieces.push(this.postfix(word));
    return pieces.filter(Boolean).join(' ');
  }

  private peekScript(script: '^' | '_'): boolean {
    this.skipSpacing();
    return isChar(this.peek(), script);
  }

  private peekPostfix(): boolean {
    this.skipSpacing();
    const token = this.peek();
    return isChar(token, '^') || isChar(token, '!') || isCmd(token, 'degree') || isCmd(token, 'circ');
  }

  private subscript(): string {
    this.pos += 1;
    const raw = this.rawArgument();
    const text = raw.map((token) => (token.kind === 'cmd' ? (GREEK.has(token.value) ? token.value : '?') : token.value)).join('');
    if (!/^[a-zA-Z0-9]+$/.test(text)) throw new Error('Subscripts may only contain letters and digits');
    return text;
  }

  private postfix(base: string): string {
    let result = base;
    for (;;) {
      this.skipSpacing();
      const token = this.peek();
      if (isChar(token, '^')) {
        this.pos += 1;
        const exponent = this.superscript();
        result = exponent === '°' ? `${result} °` : `${result} ^ ${wrap(exponent)}`;
      } else if (isChar(token, '!')) {
        this.pos += 1;
        result = `${result} !`;
      } else if (isCmd(token, 'degree') || isCmd(token, 'circ')) {
        this.pos += 1;
        result = `${result} °`;
      } else if (isChar(token, "'") || isCmd(token, 'prime')) {
        throw new Error('Prime notation is not supported; use d/dx');
      } else {
        return result;
      }
    }
  }

  // Superscript content; a lone \circ means degrees.
  private superscript(): string {
    const raw = this.rawArgument();
    if (raw.length === 1 && isCmd(raw[0], 'circ')) return '°';
    return this.sub(raw);
  }

  // Tokens of the next argument: a {group} or a single token.
  private rawArgument(): Token[] {
    this.skipSpacing();
    const token = this.peek();
    if (!token || this.isCloser(token)) throw new Error(PLACEHOLDER_ERROR);
    if (!isChar(token, '{')) {
      this.pos += 1;
      if (token.kind === 'cmd' && TEXT_WRAPPERS.has(token.value)) return [token, ...this.bracedTokens()];
      return [token];
    }
    return this.bracedTokens().slice(1, -1);
  }

  // A balanced {...} including the braces.
  private bracedTokens(): Token[] {
    const start = this.pos;
    if (!isChar(this.peek(), '{')) throw new Error(PLACEHOLDER_ERROR);
    let depth = 0;
    while (this.pos < this.tokens.length) {
      const token = this.next()!;
      if (isChar(token, '{')) depth += 1;
      else if (isChar(token, '}') && --depth === 0) return this.tokens.slice(start, this.pos);
    }
    throw new Error('Unclosed group in expression');
  }

  private sub(tokens: Token[]): string {
    if (tokens.length === 0) throw new Error(PLACEHOLDER_ERROR);
    const text = new Converter(tokens).convert();
    if (!text) throw new Error(PLACEHOLDER_ERROR);
    return text;
  }

  // Contents of a group whose opener was just consumed. abs groups close on '|'.
  private group(abs: boolean): string {
    this.bars.push(abs);
    const inner = this.sequence({});
    this.bars.pop();
    const closer = this.peek();
    if (!closer) return `${inner}`; // let the engine report the missing parenthesis
    this.pos += 1;
    if (isCmd(closer, 'right')) this.delimiter();
    return inner;
  }

  // Delimiter after \left or \right.
  private delimiter(): string {
    const token = this.next();
    if (!token) throw new Error('Missing delimiter');
    if (token.kind === 'cmd') {
      if (token.value === 'vert' || token.value === 'lvert' || token.value === 'rvert' || token.value === '|') return '|';
      if (token.value === 'lbrack' || token.value === 'rbrack') return '(';
      if (token.value === '{' || token.value === '}') return '(';
      throw new Error(`Unsupported notation: \\${token.value}`);
    }
    return token.value;
  }

  private command(name: string): string {
    if (name === 'placeholder') throw new Error(PLACEHOLDER_ERROR);
    if (name === 'left') {
      const open = this.delimiter();
      if (open === '|') return this.postfix(`(abs(${this.group(true)}))`);
      return this.postfix(wrap(this.group(false)));
    }
    if (name === 'pi') return this.postfix('pi');
    if (name === 'phi' || name === 'varphi') return this.name('phi');
    if (name === 'exponentialE') return this.postfix('e');
    if (name === 'infty') return 'infinity';
    if (name === 'degree' || name === 'circ') return '°';
    if (name === 'vert' || name === 'lvert') return this.postfix(`(abs(${this.group(true)}))`);
    if (GREEK.has(name)) return this.name(name);
    if (TEXT_WRAPPERS.has(name)) {
      const text = this.rawArgument().map((token) => token.value).join('');
      if (!/^[a-zA-Z]+$/.test(text)) throw new Error(`Unsupported notation: \\${name}{${text}}`);
      return FUNCTIONS.has(text) ? this.functionCall(text) : this.word(text);
    }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return this.fraction();
    if (name === 'binom' || name === 'dbinom') {
      const n = this.sub(this.rawArgument());
      const k = this.sub(this.rawArgument());
      return this.postfix(`(nCr(${n}, ${k}))`);
    }
    if (name === 'sqrt') return this.squareRoot();
    if (FUNCTIONS.has(name)) return this.functionCall(name);
    if (name === 'sum' || name === 'prod') return this.iteration(name);
    if (name === 'int') return this.integral();
    if (name === 'lim') return this.limit();
    throw new Error(`Unsupported notation: \\${name}`);
  }

  // A Greek letter or other symbol name, with an optional subscript.
  private name(base: string): string {
    return this.postfix(this.peekScript('_') ? `${base}_${this.subscript()}` : base);
  }

  private squareRoot(): string {
    this.skipSpacing();
    let index: string | null = null;
    if (isChar(this.peek(), '[')) {
      this.pos += 1;
      const start = this.pos;
      let depth = 0;
      while (this.pos < this.tokens.length && !(depth === 0 && isChar(this.peek(), ']'))) {
        const token = this.next()!;
        if (isChar(token, '{')) depth += 1;
        if (isChar(token, '}')) depth -= 1;
      }
      index = this.sub(this.tokens.slice(start, this.pos));
      this.pos += 1;
    }
    const radicand = this.sub(this.rawArgument());
    return this.postfix(index === null ? `(sqrt(${radicand}))` : `(root(${index}, ${radicand}))`);
  }

  private fraction(): string {
    const numerator = this.rawArgument();
    const denominator = this.rawArgument();
    const derivative = this.derivativeOperator(numerator, denominator);
    if (derivative) {
      const body = this.operand('Derivative');
      return derivative.order === 1
        ? `(derivative(${derivative.variable}, ${body}))`
        : `(derivative_n(${derivative.order}, ${derivative.variable}, ${body}))`;
    }
    return this.postfix(`((${this.sub(numerator)}) / (${this.sub(denominator)}))`);
  }

  // Recognises d/dx, d^n/dx^n (also \mathrm{d} and \partial) as an operator.
  private derivativeOperator(numerator: Token[], denominator: Token[]): { order: number; variable: string } | null {
    const top = new Converter(numerator);
    const dTop = top.differentialWidth(0);
    if (!dTop) return null;
    const topOrder = top.scriptOrder(dTop);
    if (topOrder === null) return null;

    const bottom = new Converter(denominator);
    const dBottom = bottom.differentialWidth(0);
    const variable = dBottom ? bottom.variableAt(dBottom) : null;
    if (!variable) return null;
    const bottomOrder = bottom.scriptOrder(dBottom + 1);
    if (bottomOrder === null || bottomOrder !== topOrder) return null;
    return { order: topOrder, variable };
  }

  // Parses an optional ^n at index that must end the token list; returns n.
  private scriptOrder(index: number): number | null {
    if (index === this.tokens.length) return 1;
    if (!isChar(this.tokens[index], '^')) return null;
    const rest = this.tokens.slice(index + 1).filter((token) => !isChar(token, '{') && !isChar(token, '}'));
    const text = rest.map((token) => token.value).join('');
    return /^[1-9][0-9]?$/.test(text) ? Number(text) : null;
  }

  // The term an operator applies to (\sum, \lim, d/dx): everything up to the
  // next top-level + - = , so "\sum_{i=1}^{3} i^2 x + 1" sums i^2 x only.
  private operand(what: string): string {
    const body = this.sequence({ additive: true });
    if (!body) throw new Error(`${what} requires an expression`);
    return body;
  }

  private functionCall(command: string): string {
    let engine = FUNCTIONS.get(command)!;
    let power: string | null = null;
    let base: string | null = null;
    for (;;) {
      if (this.peekScript('^')) {
        this.pos += 1;
        const exponent = this.superscript();
        if (exponent === '- 1' && INVERSE_TRIG.has(engine)) engine = INVERSE_TRIG.get(engine)!;
        else power = exponent;
      } else if (this.peekScript('_') && engine === 'log') {
        this.pos += 1;
        base = this.sub(this.rawArgument());
      } else {
        break;
      }
    }

    this.skipSpacing();
    const token = this.peek();
    let argument: string;
    if (isChar(token, '(') || isCmd(token, 'left')) {
      this.pos += 1;
      if (token!.kind === 'cmd' && this.delimiter() === '|') argument = `(abs(${this.group(true)}))`;
      else argument = this.group(false);
    } else {
      argument = this.sequence({ implicitArgument: true });
    }
    if (!argument) throw new Error(`${command} requires an argument`);

    let call: string;
    if (base !== null) call = `log(${base}, ${argument})`;
    else if (RECIPROCAL_TRIG.has(engine)) {
      const [top, bottom] = RECIPROCAL_TRIG.get(engine)!;
      call = `${top ? `${top}(${argument})` : '1'} / ${bottom}(${argument})`;
    } else call = `${engine}(${argument})`;
    const result = power === null ? `(${call})` : `(${call}) ^ (${power})`;
    return this.postfix(power === null ? result : `(${result})`);
  }

  // \sum_{i=a}^{b} body  ->  sum(i, a, b, body)
  private iteration(kind: 'sum' | 'prod'): string {
    const label = kind === 'sum' ? 'Sum' : 'Product';
    const scripts = this.limitsScripts();
    if (!scripts.lower || !scripts.upper) throw new Error(`${label} requires lower and upper bounds such as i=1 and 10`);
    const split = scripts.lower.findIndex((token) => isChar(token, '='));
    if (split <= 0) throw new Error(`${label} requires an index such as i=1 in its lower bound`);
    const variable = this.sub(scripts.lower.slice(0, split));
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable)) throw new Error(`${label} index must be a single variable`);
    const lower = this.sub(scripts.lower.slice(split + 1));
    const upper = this.sub(scripts.upper);
    return `(${kind}(${variable}, ${lower}, ${upper}, ${this.operand(label)}))`;
  }

  // \int_a^b body dx  ->  integral(a, b, x, body)
  private integral(): string {
    const scripts = this.limitsScripts();
    if (!scripts.lower || !scripts.upper) throw new Error('Integral requires lower and upper bounds');
    const lower = this.sub(scripts.lower);
    const upper = this.sub(scripts.upper);
    this.integrals.push(this.bars.length);
    const body = this.sequence({});
    this.integrals.pop();
    const width = this.differentialWidth(this.pos);
    const variable = width ? this.variableAt(this.pos + width) : null;
    if (!variable) throw new Error('Integral requires a differential such as dx');
    this.pos += width + 1;
    return `(integral(${lower}, ${upper}, ${variable}, ${body || '1'}))`;
  }

  // \lim_{x \to c^+} body  ->  limit(x, c, right, body)
  private limit(): string {
    const scripts = this.limitsScripts();
    const sub = scripts.lower;
    const arrow = sub?.findIndex((token) => token.kind === 'cmd' && ARROWS.has(token.value)) ?? -1;
    if (!sub || arrow <= 0) throw new Error('Limit requires a subscript such as x \\to 0');
    const variable = this.sub(sub.slice(0, arrow));
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable)) throw new Error('Limit variable must be a single variable');
    let target = sub.slice(arrow + 1);
    let side = '';
    const sign = (tokens: Token[]) => (isChar(tokens[0], '+') ? 'right' : isChar(tokens[0], '-') ? 'left' : '');
    const caret = target.findIndex((token) => isChar(token, '^'));
    if (caret > 0) {
      const script = target.slice(caret + 1).filter((token) => !isChar(token, '{') && !isChar(token, '}'));
      if (script.length === 1 && sign(script)) {
        side = sign(script);
        target = target.slice(0, caret);
      }
    } else if (target.length > 1 && sign(target.slice(-1)) && !isCmd(target[target.length - 2], 'infty')) {
      side = sign(target.slice(-1));
      target = target.slice(0, -1);
    }
    const point = this.sub(target);
    return `(limit(${variable}, ${point}, ${side ? `${side}, ` : ''}${this.operand('Limit')}))`;
  }

  // _{...} and ^{...} in either order.
  private limitsScripts(): { lower: Token[] | null; upper: Token[] | null } {
    let lower: Token[] | null = null;
    let upper: Token[] | null = null;
    for (;;) {
      if (this.peekScript('_') && !lower) {
        this.pos += 1;
        lower = this.rawArgument();
      } else if (this.peekScript('^') && !upper) {
        this.pos += 1;
        upper = this.rawArgument();
      } else {
        return { lower, upper };
      }
    }
  }
}

/**
 * Converts MathLive LaTeX into the canonical engine language, e.g.
 * "\frac{1}{2}x^{2}" -> "((1) / (2)) x ^ (2)". Throws on incomplete or
 * unsupported notation with a user-facing message.
 */
export function latexToEngine(latex: string): string {
  if (!latex.trim()) return '';
  return new Converter(tokenize(latex)).convert();
}
