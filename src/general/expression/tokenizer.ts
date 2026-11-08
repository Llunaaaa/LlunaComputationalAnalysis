export type TokenType = 'num' | 'id' | 'inf' | 'deg' | 'op' | 'eof';

export interface Token {
  type: TokenType;
  text: string;
  value: number;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*|[πϕφ])|(∞)|(°)|([-+*/^!()|,=]))/y;
  let position = 0;
  while (position < text.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (!match) {
      if (/^\s*$/.test(text.slice(position))) break;
      throw new Error('Unexpected character in expression');
    }
    position = pattern.lastIndex;
    if (match[1] !== undefined) {
      const value = Number(match[1]);
      if (!Number.isFinite(value)) throw new Error('The number is not finite');
      tokens.push({ type: 'num', text: match[1], value });
    } else if (match[2] !== undefined) tokens.push({ type: 'id', text: match[2], value: 0 });
    else if (match[3] !== undefined) tokens.push({ type: 'inf', text: 'infinity', value: 0 });
    else if (match[4] !== undefined) tokens.push({ type: 'deg', text: '°', value: 0 });
    else tokens.push({ type: 'op', text: match[5], value: 0 });
  }
  tokens.push({ type: 'eof', text: '', value: 0 });
  return tokens;
}
