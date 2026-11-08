import { UNICODE_COMMANDS } from './lexicon.ts';
import type { Token } from './lexicon.ts';

export function tokenize(latex: string): Token[] {
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
