import { convertLatexToAsciiMath } from 'mathlive';

function extractBraced(str: string, pos: number): { content: string; nextPos: number } | null {
  if (pos >= str.length || str[pos] !== '{') return null;
  let depth = 0;
  const start = pos + 1;
  for (let i = pos; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(start, i), nextPos: i + 1 };
      }
    }
  }
  return null;
}

function parseLatexSumProd(latex: string): string {
  let s = latex.trim();

  // 1. Check for infinite bounds
  if (/\\(?:sum|prod)[^}]*(?:\\infty|oo|\binfty\b)/i.test(s) || /\\infty/.test(s)) {
    throw new Error('Infinite bounds are not supported');
  }

  let changed = true;
  while (changed) {
    changed = false;
    const match = s.match(/\\(sum|prod)(?=[_^\s{]|$)/);
    if (!match || match.index === undefined) break;

    const op = match[1];
    const opIndex = match.index;
    let pos = opIndex + match[0].length;

    let lowerRaw = '';
    let upperRaw = '';

    // Parse bounds: could be _{lower}^{upper} or ^{upper}_{lower}
    for (let b = 0; b < 2; b++) {
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      if (pos >= s.length) break;

      if (s[pos] === '_') {
        pos++;
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        if (s[pos] === '{') {
          const res = extractBraced(s, pos);
          if (res) {
            lowerRaw = res.content;
            pos = res.nextPos;
          }
        } else {
          let tokenEnd = pos;
          while (tokenEnd < s.length && /[a-zA-Z0-9]/.test(s[tokenEnd])) tokenEnd++;
          lowerRaw = s.slice(pos, tokenEnd);
          pos = tokenEnd;
        }
      } else if (s[pos] === '^') {
        pos++;
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        if (s[pos] === '{') {
          const res = extractBraced(s, pos);
          if (res) {
            upperRaw = res.content;
            pos = res.nextPos;
          }
        } else {
          let tokenEnd = pos;
          while (tokenEnd < s.length && /[a-zA-Z0-9]/.test(s[tokenEnd])) tokenEnd++;
          upperRaw = s.slice(pos, tokenEnd);
          pos = tokenEnd;
        }
      }
    }

    // Now extract body
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    let bodyRaw = '';
    let endPos = pos;

    if (pos < s.length && s[pos] === '{') {
      const res = extractBraced(s, pos);
      if (res) {
        bodyRaw = res.content;
        endPos = res.nextPos;
      }
    } else {
      if (pos < s.length && s.slice(pos).startsWith('\\left(')) {
        let depth = 0;
        let p = pos;
        while (p < s.length) {
          if (s.slice(p).startsWith('\\left(')) { depth++; p += 6; }
          else if (s.slice(p).startsWith('\\right)')) { depth--; p += 7; if (depth === 0) break; }
          else p++;
        }
        bodyRaw = s.slice(pos, p);
        endPos = p;
      } else if (pos < s.length && s[pos] === '(') {
        let depth = 0;
        let p = pos;
        while (p < s.length) {
          if (s[p] === '(') depth++;
          else if (s[p] === ')') { depth--; if (depth === 0) { p++; break; } }
          p++;
        }
        bodyRaw = s.slice(pos, p);
        endPos = p;
      } else {
        let p = pos;
        while (p < s.length && !/[+\-]/.test(s[p]) && !s.slice(p).startsWith('\\sum') && !s.slice(p).startsWith('\\prod')) {
          p++;
        }
        bodyRaw = s.slice(pos, p).trim();
        endPos = p;
      }
    }

    if (!lowerRaw && !upperRaw && !bodyRaw) {
      break;
    }

    let varName = 'i';
    let lowerBound = lowerRaw;
    const eqIdx = lowerRaw.indexOf('=');
    if (eqIdx !== -1) {
      varName = lowerRaw.slice(0, eqIdx).trim() || 'i';
      lowerBound = lowerRaw.slice(eqIdx + 1).trim();
    }

    if (!bodyRaw) bodyRaw = '0';

    const replacement = `${op}(${varName}, ${latexToEngine(lowerBound)}, ${latexToEngine(upperRaw)}, ${latexToEngine(bodyRaw)})`;
    s = s.slice(0, opIndex) + replacement + s.slice(endPos);
    changed = true;
  }

  return s;
}

/**
 * Converts MathLive LaTeX output into the mathematical syntax expected by the C++ engine.
 */
export function latexToEngine(latex: string): string {
  if (!latex || !latex.trim()) return '';

  let s = parseLatexSumProd(latex.trim());

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
