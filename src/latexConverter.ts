import { convertLatexToAsciiMath } from 'mathlive';

/**
 * Converts MathLive LaTeX output into the mathematical syntax expected by the C++ engine.
 */
export function latexToEngine(latex: string): string {
  if (!latex || !latex.trim()) return '';

  let expr = convertLatexToAsciiMath(latex);

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

  // Multiplications
  expr = expr.replace(/cdot/g, '*').replace(/times/g, '*');

  // Constants
  expr = expr.replace(/\\pi/g, 'pi').replace(/π/g, 'pi');

  // Fractions: ensure (a)/(b) format is clean
  // Clean multiple spaces
  expr = expr.replace(/\s+/g, ' ').trim();

  return expr;
}
