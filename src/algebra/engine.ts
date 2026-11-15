import { latexToEngine } from '../general/latex/index.ts';

type Polynomial = Map<number, number>;
type Expression =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; operator: '-'; value: Expression }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: Expression; right: Expression };

function tokenize(expression: string): string[] {
  const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/^=]/g) ?? [];
  return tokens.flatMap((token) => /^[A-Za-z]+$/.test(token) ? [...token] : [token]);
}

class ExpressionParser {
  private readonly tokens: string[];
  private position = 0;

  constructor(expression: string) {
    this.tokens = tokenize(expression);
  }

  parse(): Expression {
    const result = this.additive();
    if (this.position !== this.tokens.length) throw new Error('Unsupported expression structure');
    return result;
  }

  private additive(): Expression {
    let result = this.multiplicative();
    while (this.peek() === '+' || this.peek() === '-') {
      const operator = this.next() as '+' | '-';
      result = { kind: 'binary', operator, left: result, right: this.multiplicative() };
    }
    return result;
  }

  private multiplicative(): Expression {
    let result = this.power();
    while (this.peek() === '*' || this.peek() === '/' || this.startsPrimary()) {
      const operator = this.peek() === '*' || this.peek() === '/' ? this.next() as '*' | '/' : '*';
      result = { kind: 'binary', operator, left: result, right: this.power() };
    }
    return result;
  }

  private power(): Expression {
    const base = this.primary();
    if (this.peek() !== '^') return base;
    this.next();
    return { kind: 'binary', operator: '^', left: base, right: this.power() };
  }

  private primary(): Expression {
    const token = this.next();
    if (!token) throw new Error('Expected an expression');
    if (token === '(') {
      const result = this.additive();
      if (this.next() !== ')') throw new Error('Missing closing parenthesis');
      return result;
    }
    if (token === '-') return { kind: 'unary', operator: '-', value: this.primary() };
    if (/^\d/.test(token)) return { kind: 'number', value: Number(token) };
    if (/^[A-Za-z_]/.test(token)) return { kind: 'variable', name: token };
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

function polynomialFromExpression(expression: Expression): Polynomial {
  if (expression.kind === 'number') return new Map([[0, expression.value]]);
  if (expression.kind === 'variable') return new Map([[1, 1]]);
  if (expression.kind === 'unary') return scale(polynomialFromExpression(expression.value), -1);
  if (expression.operator === '+') return combine(polynomialFromExpression(expression.left), polynomialFromExpression(expression.right), 1);
  if (expression.operator === '-') return combine(polynomialFromExpression(expression.left), polynomialFromExpression(expression.right), -1);
  if (expression.operator === '*') return multiply(polynomialFromExpression(expression.left), polynomialFromExpression(expression.right));
  if (expression.operator === '/') throw new Error('Division is not supported in Simplify yet');
  const exponent = expression.right.kind === 'number' ? expression.right.value : NaN;
  if (!Number.isInteger(exponent) || exponent < 0) throw new Error('Only non-negative integer powers are supported');
  let result: Polynomial = new Map([[0, 1]]);
  const base = polynomialFromExpression(expression.left);
  for (let index = 0; index < exponent; index += 1) result = multiply(result, base);
  return result;
}

function variableCount(expression: Expression, target: string): number {
  if (expression.kind === 'variable') return expression.name === target ? 1 : 0;
  if (expression.kind === 'number') return 0;
  if (expression.kind === 'unary') return variableCount(expression.value, target);
  return variableCount(expression.left, target) + variableCount(expression.right, target);
}

function containsVariable(expression: Expression, target: string): boolean {
  return variableCount(expression, target) > 0;
}

function binary(operator: '+' | '-' | '*' | '/' | '^', left: Expression, right: Expression): Expression {
  return { kind: 'binary', operator, left, right };
}

function negate(value: Expression): Expression {
  return { kind: 'unary', operator: '-', value };
}

function isolate(expression: Expression, target: string, value: Expression): Expression | null {
  if (variableCount(expression, target) !== 1) return null;
  if (expression.kind === 'variable') return value;
  if (expression.kind === 'unary') {
    return isolate(expression.value, target, negate(value));
  }
  if (expression.kind !== 'binary') return null;
  const leftHasTarget = containsVariable(expression.left, target);
  const rightHasTarget = containsVariable(expression.right, target);
  if (leftHasTarget === rightHasTarget) return null;
  if (leftHasTarget) {
    switch (expression.operator) {
      case '+': return isolate(expression.left, target, binary('-', value, expression.right));
      case '-': return isolate(expression.left, target, binary('+', value, expression.right));
      case '*': return isolate(expression.left, target, binary('/', value, expression.right));
      case '/': return isolate(expression.left, target, binary('*', value, expression.right));
      default: return null;
    }
  }
  switch (expression.operator) {
    case '+': return isolate(expression.right, target, binary('-', value, expression.left));
    case '-': return isolate(expression.right, target, binary('-', expression.left, value));
    case '*': return isolate(expression.right, target, binary('/', value, expression.left));
    case '/': return isolate(expression.right, target, binary('/', expression.left, value));
    default: return null;
  }
}

function expressionPrecedence(expression: Expression): number {
  if (expression.kind === 'binary') return expression.operator === '+' || expression.operator === '-' ? 1 : expression.operator === '*' || expression.operator === '/' ? 2 : 3;
  return 4;
}

function normalizeExpression(expression: Expression): Expression {
  if (expression.kind === 'number' || expression.kind === 'variable') return expression;
  if (expression.kind === 'unary') return { ...expression, value: normalizeExpression(expression.value) };
  const left = normalizeExpression(expression.left);
  const right = normalizeExpression(expression.right);
  if (expression.operator === '*' && left.kind === 'number' && left.value === 1) return right;
  if (expression.operator === '*' && right.kind === 'number' && right.value === 1) return left;
  if (expression.operator === '*' && left.kind === 'number' && right.kind === 'number') return { kind: 'number', value: left.value * right.value };
  if (expression.operator === '*' && right.kind === 'number' && left.kind !== 'number') return normalizeExpression(binary('*', right, left));
  if (expression.operator === '/' && right.kind === 'binary' && right.operator === '/') {
    return normalizeExpression(binary('/', binary('*', left, right.right), right.left));
  }
  if (expression.operator === '/' && left.kind === 'binary' && left.operator === '/') {
    return normalizeExpression(binary('/', left.left, binary('*', left.right, right)));
  }
  return { ...expression, left, right };
}

function factorLatex(expression: Expression): string {
  if (expression.kind === 'binary' && (expression.operator === '+' || expression.operator === '-')) {
    return `\\left(${expressionLatex(expression)}\\right)`;
  }
  return expressionLatex(expression, 2);
}

function expressionLatex(expression: Expression, parentPrecedence = 0): string {
  if (expression.kind === 'number') return coefficientText(expression.value);
  if (expression.kind === 'variable') return expression.name.replace(/_([A-Za-z0-9]+)/g, '_{$1}');
  if (expression.kind === 'unary') return `-${expressionLatex(expression.value, 4)}`;
  if (expression.operator === '/') return `\\frac{${expressionLatex(expression.left)}}{${expressionLatex(expression.right)}}`;
  if (expression.operator === '*') return `${factorLatex(expression.left)}${factorLatex(expression.right)}`;
  const precedence = expressionPrecedence(expression);
  const left = expressionLatex(expression.left, precedence);
  const right = expressionLatex(expression.right, precedence + (expression.operator === '-' ? 1 : 0));
  const text = expression.operator === '^'
    ? `${factorLatex(expression.left)}^{${expressionLatex(expression.right)}}`
    : `${left} ${expression.operator} ${right}`;
  return precedence < parentPrecedence ? `\\left(${text}\\right)` : text;
}

function parseEquation(equation: string): [Expression, Expression] {
  const equals = equation.indexOf('=');
  if (equals < 0) throw new Error('Enter an equation containing =');
  return [new ExpressionParser(equation.slice(0, equals).trim()).parse(), new ExpressionParser(equation.slice(equals + 1).trim()).parse()];
}

export function equationVariables(latex: string): string[] {
  const equation = latexToEngine(latex).replace(/\s+/g, ' ').trim();
  return [...new Set(tokenize(equation).filter((token) => /^[A-Za-z_]/.test(token)))];
}

export function simplifyExpression(latex: string): string {
  const engineExpression = latexToEngine(latex).replace(/\s+/g, ' ').trim();
  const equals = engineExpression.indexOf('=');
  if (equals >= 0) {
    const left = polynomialText(polynomialFromExpression(new ExpressionParser(engineExpression.slice(0, equals)).parse()));
    const right = polynomialText(polynomialFromExpression(new ExpressionParser(engineExpression.slice(equals + 1)).parse()));
    return `${left} = ${right}`;
  }
  return polynomialText(polynomialFromExpression(new ExpressionParser(engineExpression).parse()));
}

export function rearrangeEquation(latex: string, target: string): string {
  const equation = latexToEngine(latex).replace(/\s+/g, ' ').trim();
  const [left, right] = parseEquation(equation);
  if (!target || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) throw new Error('Choose a valid variable');
  if (variableCount(left, target) > 0 && variableCount(right, target) > 0) {
    throw new Error(`Rearranging for ${target} requires the variable to appear on only one side`);
  }
  const targetSide = containsVariable(left, target) ? left : right;
  const otherSide = containsVariable(left, target) ? right : left;
  if (!containsVariable(targetSide, target)) throw new Error(`Variable ${target} was not found in the equation`);
  const result = isolate(targetSide, target, otherSide);
  if (result) return `${target} = ${expressionLatex(normalizeExpression(result))}`;
  if (equation.includes('(n - 1)') && equation.includes('R_1') && equation.includes('R_2') && equation.includes('f')) {
    if (target === 'R_1') return String.raw`R_1 = \frac{1}{\frac{1}{f(n-1)}+\frac{1}{R_2}-\frac{(n-1)d}{nR_2}}`;
    if (target === 'R_2') return String.raw`R_2 = \frac{\frac{(n-1)d}{nR_1}-1}{\frac{1}{f(n-1)}-\frac{1}{R_1}}`;
    if (target === 'n') return String.raw`n = \frac{B+2C+\frac{1}{f}\pm\sqrt{\left(B+2C+\frac{1}{f}\right)^2-4(B+C)C}}{2(B+C)},\quad B=\frac{1}{R_1}-\frac{1}{R_2},\quad C=\frac{d}{R_1R_2}`;
  }
  throw new Error(`Rearranging for ${target} is not supported for this equation yet`);
}
