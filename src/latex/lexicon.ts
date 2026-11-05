export type Token = { kind: 'cmd' | 'chr'; value: string };

export const PLACEHOLDER_ERROR = 'Please fill in all placeholders in the expression';

export const UNICODE_COMMANDS: Record<string, string> = {
  'π': 'pi', 'ϕ': 'phi', 'φ': 'phi', '∞': 'infty', '°': 'degree',
  '·': 'cdot', '×': 'times', '÷': 'div', '−': '-', '→': 'to',
};

export const SPACING = new Set([
  ',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle',
  'limits', 'nolimits', 'mathstrut', 'enspace', 'thinspace',
]);
export const TEXT_WRAPPERS = new Set([
  'operatorname', 'mathrm', 'text', 'textrm', 'mathit', 'mathbf', 'mathsf',
  'textit', 'textbf', 'mathnormal',
]);
export const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);

// Commands that name engine functions; the value is the engine name.
export const FUNCTIONS = new Map([
  ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['arcsin', 'asin'], ['arccos', 'acos'], ['arctan', 'atan'],
  ['ln', 'ln'], ['log', 'log'], ['exp', 'exp'], ['gcd', 'gcd'], ['lcm', 'lcm'],
  ['sec', 'sec'], ['csc', 'csc'], ['cot', 'cot'],
]);
export const INVERSE_TRIG = new Map([['sin', 'asin'], ['cos', 'acos'], ['tan', 'atan']]);

// Reciprocal trig as numerator / denominator function ('' means 1).
export const RECIPROCAL_TRIG = new Map([['sec', ['', 'cos']], ['csc', ['', 'sin']], ['cot', ['cos', 'sin']]]);

// Multi-letter names that typed letters may legitimately spell as one word.
export const ENGINE_WORDS = new Set([
  'pi', 'phi', 'e', 'ans', 'infinity', 'inf', 'oo',
  'sqrt', 'root', 'log', 'ln', 'exp', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'gcd', 'lcm', 'mod', 'nCr', 'comb', 'nPr', 'perm',
  'sum', 'prod', 'integral', 'int', 'derivative', 'diff', 'limit',
]);
export const OPERATORS = new Map([['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['=', '='], [',', ',']]);
export const OPERATOR_COMMANDS = new Map([['cdot', '*'], ['times', '*'], ['ast', '*'], ['div', '/']]);
export const ARROWS = new Set(['to', 'rightarrow', 'longrightarrow', 'Rightarrow']);

export const isLetter = (token: Token | undefined) => token?.kind === 'chr' && /^[a-zA-Z]$/.test(token.value);
export const isDigit = (token: Token | undefined) => token?.kind === 'chr' && /^[0-9.]$/.test(token.value);
export const isChar = (token: Token | undefined, value: string) => token?.kind === 'chr' && token.value === value;
export const isCmd = (token: Token | undefined, value: string) => token?.kind === 'cmd' && token.value === value;
export const wrap = (text: string) => `(${text})`;
