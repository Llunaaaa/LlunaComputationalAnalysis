// Small symbolic foundation for graph equations. This intentionally handles
// only affine expressions, leaving nonlinear rearrangement for a future CAS.

interface Affine { x: number; y: number; constant: number }
interface CasToken { type: 'number' | 'name' | 'operator'; text: string }

const TOKEN = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([xy])|([()+\-*/^]))/gy;

function tokenize(text: string): CasToken[] | null {
  const tokens: CasToken[] = [];
  let position = 0;
  while (position < text.length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(text);
    if (!match) return null;
    position = TOKEN.lastIndex;
    tokens.push(match[1] !== undefined
      ? { type: 'number', text: match[1] }
      : match[2] !== undefined
        ? { type: 'name', text: match[2] }
        : { type: 'operator', text: match[3] });
  }
  tokens.push({ type: 'operator', text: 'eof' });
  return tokens;
}

const add = (a: Affine, b: Affine): Affine => ({ x: a.x + b.x, y: a.y + b.y, constant: a.constant + b.constant });
const scale = (a: Affine, factor: number): Affine => ({ x: a.x * factor, y: a.y * factor, constant: a.constant * factor });
const isConstant = (a: Affine) => a.x === 0 && a.y === 0;
const finite = (a: Affine) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.constant);

class AffineParser {
  private position = 0;
  private readonly tokens: CasToken[];
  constructor(tokens: CasToken[]) {
    this.tokens = tokens;
  }

  parse(): Affine | null {
    const result = this.expression();
    return this.peek().text === 'eof' && result && finite(result) ? result : null;
  }

  private peek(): CasToken { return this.tokens[this.position]; }
  private match(text: string): boolean {
    if (this.peek().text !== text) return false;
    this.position += 1;
    return true;
  }

  private expression(): Affine | null {
    let result = this.term();
    while (result && (this.match('+') || this.match('-'))) {
      const operator = this.tokens[this.position - 1].text;
      const right = this.term();
      if (!right) return null;
      result = operator === '+' ? add(result, right) : add(result, scale(right, -1));
    }
    return result;
  }

  private term(): Affine | null {
    let result = this.factor();
    while (result && (this.match('*') || this.match('/') || this.startsFactor())) {
      const implicit = this.tokens[this.position - 1].text !== '*' && this.tokens[this.position - 1].text !== '/';
      const operator = implicit ? '*' : this.tokens[this.position - 1].text;
      const right = this.factor();
      if (!right || (operator === '/' && (!isConstant(right) || right.constant === 0))) return null;
      if (operator === '*') {
        if (!isConstant(result) && !isConstant(right)) return null;
        result = isConstant(result) ? scale(right, result.constant) : scale(result, right.constant);
      } else {
        result = scale(result, 1 / right.constant);
      }
    }
    return result;
  }

  private startsFactor(): boolean {
    const token = this.peek();
    return token.type === 'number' || token.type === 'name' || token.text === '(';
  }

  private factor(): Affine | null {
    if (this.match('+')) return this.factor();
    if (this.match('-')) {
      const value = this.factor();
      return value ? scale(value, -1) : null;
    }
    let result: Affine | null;
    const token = this.peek();
    if (this.match('(')) {
      result = this.expression();
      if (!this.match(')')) return null;
    } else if (token.type === 'number') {
      this.position += 1;
      result = { x: 0, y: 0, constant: Number(token.text) };
    } else if (token.type === 'name') {
      this.position += 1;
      result = token.text === 'x' ? { x: 1, y: 0, constant: 0 } : { x: 0, y: 1, constant: 0 };
    } else {
      return null;
    }
    if (!result) return null;
    if (!this.match('^')) return result;
    const exponent = this.peek();
    if (exponent.type !== 'number') return null;
    this.position += 1;
    const power = Number(exponent.text);
    if (power === 0 && isConstant(result)) return { x: 0, y: 0, constant: 1 };
    if (power === 1) return result;
    return null;
  }
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

function affineText(value: Affine): string {
  const parts: string[] = [];
  if (value.x !== 0) parts.push(`${number(value.x)}*x`);
  if (value.constant !== 0 || parts.length === 0) parts.push(number(value.constant));
  return parts.reduce((text, part, index) => {
    if (index === 0) return part;
    return part.startsWith('-') ? `${text} - ${part.slice(1)}` : `${text} + ${part}`;
  }, '');
}

/** Returns `y = f(x)` for safe affine equations, otherwise null. */
export function normalizeImplicitEquation(engine: string): string | null {
  const parts = engine.split('=').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0].includes('y') && !parts[1].includes('y')) return null;
  const leftTokens = tokenize(parts[0]);
  const rightTokens = tokenize(parts[1]);
  if (!leftTokens || !rightTokens) return null;
  const left = new AffineParser(leftTokens).parse();
  const right = new AffineParser(rightTokens).parse();
  if (!left || !right) return null;
  const equation = add(left, scale(right, -1));
  if (equation.y === 0) return null;
  return `y = ${affineText(scale({ x: equation.x, y: 0, constant: equation.constant }, -1 / equation.y))}`;
}
