import { convertLatexToAsciiMath } from 'mathlive';

/**
 * Converts MathLive LaTeX output into the mathematical syntax expected by the C++ engine.
 */
export function latexToEngine(latex: string): string {
  if (!latex || !latex.trim()) return '';

  let s = latex.trim();

  // Check for infinity in summation or product
  if (/\\(?:sum|prod)/.test(s) && (/\\infty/.test(s) || /\\operatorname\{oo\}/i.test(s) || /\boo\b/i.test(s))) {
    throw new Error('Infinite bounds are not supported');
  }

  // Handle \sum_{i=1}^{5} body or \prod_{i=1}^{5} body
  const sumRegex1 = /\\(sum|prod)_\{([a-zA-Z])\s*=\s*([^{}]+)\}\^\{([^{}]+)\}\s*(.*)/;
  const sumRegex2 = /\\(sum|prod)\^\{([^{}]+)\}_\{([a-zA-Z])\s*=\s*([^{}]+)\}\s*(.*)/;
  const sumRegexNoVar1 = /\\(sum|prod)_\{([^{}]+)\}\^\{([^{}]+)\}\s*(.*)/;
  const sumRegexNoVar2 = /\\(sum|prod)\^\{([^{}]+)\}_\{([^{}]+)\}\s*(.*)/;

  let m = s.match(sumRegex1);
  if (m) {
    return `${m[1]}(${m[2]}, ${latexToEngine(m[3])}, ${latexToEngine(m[4])}, ${latexToEngine(m[5])})`;
  }
  m = s.match(sumRegex2);
  if (m) {
    return `${m[1]}(${m[3]}, ${latexToEngine(m[4])}, ${latexToEngine(m[2])}, ${latexToEngine(m[5])})`;
  }
  m = s.match(sumRegexNoVar1);
  if (m) {
    return `${m[1]}(i, ${latexToEngine(m[2])}, ${latexToEngine(m[3])}, ${latexToEngine(m[4])})`;
  }
  m = s.match(sumRegexNoVar2);
  if (m) {
    return `${m[1]}(i, ${latexToEngine(m[3])}, ${latexToEngine(m[2])}, ${latexToEngine(m[4])})`;
  }

  s = s.replace(/\\binom\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, 'nCr($1, $2)');
  s = s.replace(/\\(?:b|p)?mod\s*\{([^{}]+)\}/g, 'mod($1)');
  s = s.replace(/\\(?:b|p)?mod\s+([0-9a-zA-Z]+)/g, ', $1)');

  let expr = convertLatexToAsciiMath(s);

  // Normalize MathLive log output
  // e.g. log _2(8) -> log(2)(8), log _{10}(100) -> log(10)(100)
  expr = expr.replace(/log\s*_\s*\{([^}]+)\}\s*\(([^)]+)\)/g, 'log($1)($2)');
  expr = expr.replace(/log\s*_\s*\{([^}]+)\}\s*([0-9a-zA-Z]+)/g, 'log($1)($2)');
  expr = expr.replace(/log\s*_\s*([0-9a-zA-Z]+)\s*\(([^)]+)\)/g, 'log($1)($2)');
  expr = expr.replace(/log\s*_\s*([0-9a-zA-Z]+)\s*([0-9a-zA-Z]+)/g, 'log($1)($2)');

  // log (100) -> log(100)
  expr = expr.replace(/log\s*\(([^)]+)\)/g, 'log($1)');

  // ln (e) -> ln(e)
  expr = expr.replace(/ln\s*\(([^)]+)\)/g, 'ln($1)');

  // Fix spaced function names produced by MathLive
  expr = expr.replace(/n\s*C\s*r\s*\(/gi, 'nCr(');
  expr = expr.replace(/n\s*P\s*r\s*\(/gi, 'nPr(');
  expr = expr.replace(/m\s*o\s*d\s*\(/gi, 'mod(');
  expr = expr.replace(/g\s*c\s*d\s*\(/gi, 'gcd(');
  expr = expr.replace(/l\s*c\s*m\s*\(/gi, 'lcm(');
  expr = expr.replace(/a\s*b\s*s\s*\(/gi, 'abs(');
  expr = expr.replace(/c\s*o\s*m\s*b\s*\(/gi, 'comb(');
  expr = expr.replace(/p\s*e\s*r\s*m\s*\(/gi, 'perm(');

  // Multiplications
  expr = expr.replace(/cdot/g, '*').replace(/times/g, '*');

  // Constants
  expr = expr.replace(/\\pi/g, 'pi').replace(/π/g, 'pi');
  expr = expr.replace(/\\phi/g, 'phi').replace(/ϕ/g, 'phi').replace(/φ/g, 'phi');

  // Clean multiple spaces
  expr = expr.replace(/\s+/g, ' ').trim();

  return expr;
}
