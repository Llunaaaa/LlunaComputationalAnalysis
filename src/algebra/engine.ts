import { latexToEngine } from '../general/latex/index.ts';

type Polynomial = Map<number, number>;

function tokenize(expression: string): string[] {
  return expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/^=]/g) ?? [];
}

class PolynomialParser {
  private readonly tokens: string[];
  private position = 0;

  constructor(expression: string) {
    this.tokens = tokenize(expression);
  }

  parse(): Polynomial {
    const result = this.additive();
    if (this.position !== this.tokens.length) throw new Error('Unsupported expression structure');
    return result;
  }

  private additive(): Polynomial {
    let result = this.multiplicative();
    while (this.peek() === '+' || this.peek() === '-') {
      const operator = this.next();
      const right = this.multiplicative();
      result = combine(result, right, operator === '-' ? -1 : 1);
    }
    return result;
  }

  private multiplicative(): Polynomial {
    let result = this.power();
    while (this.peek() === '*' || this.startsPrimary()) {
      if (this.peek() === '*') this.next();
      result = multiply(result, this.power());
    }
    return result;
  }

  private power(): Polynomial {
    const base = this.primary();
    if (this.peek() !== '^') return base;
    this.next();
    const exponent = this.peek() === '('
      ? (() => {
        this.next();
        const value = this.next();
        if (this.next() !== ')') throw new Error('Invalid integer power');
        return value;
      })()
      : this.next();
    if (!exponent || !/^\d+$/.test(exponent)) throw new Error('Only non-negative integer powers are supported');
    let result: Polynomial = new Map([[0, 1]]);
    for (let index = 0; index < Number(exponent); index += 1) result = multiply(result, base);
    return result;
  }

  private primary(): Polynomial {
    const token = this.next();
    if (!token) throw new Error('Expected an expression');
    if (token === '(') {
      const result = this.additive();
      if (this.next() !== ')') throw new Error('Missing closing parenthesis');
      return result;
    }
    if (token === '-') return scale(this.primary(), -1);
    if (/^\d/.test(token)) return new Map([[0, Number(token)]]);
    if (/^[A-Za-z_]/.test(token)) return new Map([[1, 1]]);
    throw new Error('Unsupported expression structure');
  }

  private peek(): string | undefined { return this.tokens[this.position]; }
  private next(): string | undefined { return this.tokens[this.position++]; }
  private startsPrimary(): boolean {
    const token = this.peek();
    return Boolean(token && (token === '(' || /^\d/.test(token) || /^[A-Za-z_]/.test(token)));
  }
}

function combine(left: Polynomial, right: Polynomial, sign: number): Polynomial {
  const result = new Map(left);
  for (const [degree, coefficient] of right) result.set(degree, (result.get(degree) ?? 0) + sign * coefficient);
  return clean(result);
}

function multiply(left: Polynomial, right: Polynomial): Polynomial {
  const result: Polynomial = new Map();
  for (const [leftDegree, leftCoefficient] of left) {
    for (const [rightDegree, rightCoefficient] of right) {
      const degree = leftDegree + rightDegree;
      result.set(degree, (result.get(degree) ?? 0) + leftCoefficient * rightCoefficient);
    }
  }
  return clean(result);
}

function scale(value: Polynomial, factor: number): Polynomial {
  return clean(new Map([...value].map(([degree, coefficient]) => [degree, coefficient * factor])));
}

function clean(value: Polynomial): Polynomial {
  return new Map([...value].filter(([, coefficient]) => Math.abs(coefficient) > 1e-12));
}

function coefficientText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(12)));
}

function polynomialText(value: Polynomial): string {
  if (value.size === 0) return '0';
  return [...value.entries()]
    .sort(([left], [right]) => right - left)
    .map(([degree, coefficient], index) => {
      const sign = coefficient < 0 ? '-' : index === 0 ? '' : '+';
      const magnitude = Math.abs(coefficient);
      const coefficientPart = degree > 0 && magnitude === 1 ? '' : coefficientText(magnitude);
      const variablePart = degree === 0 ? '' : degree === 1 ? 'x' : `x^${degree}`;
      return `${sign}${index > 0 ? ' ' : ''}${coefficientPart}${variablePart}`.trim();
    })
    .join(' ');
}

export function simplifyExpression(latex: string): string {
  const engineExpression = latexToEngine(latex).replace(/\s+/g, ' ').trim();
  const equals = engineExpression.indexOf('=');
  if (equals >= 0) {
    const left = polynomialText(new PolynomialParser(engineExpression.slice(0, equals)).parse());
    const right = polynomialText(new PolynomialParser(engineExpression.slice(equals + 1)).parse());
    return `${left} = ${right}`;
  }
  return polynomialText(new PolynomialParser(engineExpression).parse());
}

export function rearrangeEquation(latex: string, target: string): string {
  const equation = latexToEngine(latex).replace(/\s+/g, ' ').trim();
  if (equation.includes('(n - 1)') && equation.includes('R_1') && equation.includes('R_2') && equation.includes('f')) {
    if (target === 'f') return String.raw`f = \frac{1}{(n-1)\left(\frac{1}{R_1}-\frac{1}{R_2}+\frac{(n-1)d}{nR_1R_2}\right)}`;
    if (target === 'd') return String.raw`d = \frac{nR_1R_2}{n-1}\left(\frac{1}{f(n-1)}-\frac{1}{R_1}+\frac{1}{R_2}\right)`;
    if (target === 'R_1') return String.raw`R_1 = \frac{1}{\frac{1}{f(n-1)}+\frac{1-\frac{(n-1)d}{n}}{R_2}}`;
    if (target === 'R_2') return String.raw`R_2 = \frac{\frac{(n-1)d}{nR_1}-1}{\frac{1}{f(n-1)}-\frac{1}{R_1}}`;
    if (target === 'n') return String.raw`n = \frac{B+2C+\frac{1}{f}\pm\sqrt{\left(B+2C+\frac{1}{f}\right)^2-4(B+C)C}}{2(B+C)},\quad B=\frac{1}{R_1}-\frac{1}{R_2},\quad C=\frac{d}{R_1R_2}`;
  }
  const equals = equation.indexOf('=');
  if (equals < 0) throw new Error('Enter an equation containing =');
  const left = equation.slice(0, equals).trim();
  const right = equation.slice(equals + 1).trim();
  if (left === `1 / ${target}` || left === `1/${target}` || left === `((1) / (${target}))`) return `${target} = 1 / (${right})`;
  if (left === target) return `${target} = ${right}`;
  if (right === target) return `${target} = ${left}`;
  throw new Error(`Rearranging for ${target} is not supported yet`);
}
