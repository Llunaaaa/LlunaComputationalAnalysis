const tokenPattern = /\s*(\d+(?:\.\d+)?|\.\d+|[A-Za-z]+|[()+\-*/^!])\s*/g;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function tokenize(expression: string): string[] | null {
  const tokens: string[] = [];
  let position = 0;
  while (position < expression.length) {
    if (/^\s*$/.test(expression.slice(position))) break;
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(expression);
    if (!match || match.index !== position) return null;
    tokens.push(match[1]);
    position = tokenPattern.lastIndex;
  }
  return tokens;
}

function closingParenthesis(tokens: string[], opening: number): number {
  let depth = 0;
  for (let index = opening; index < tokens.length; index += 1) {
    if (tokens[index] === "(") depth += 1;
    if (tokens[index] === ")" && --depth === 0) return index;
  }
  return -1;
}

function operandEnd(tokens: string[], start: number): number {
  if (tokens[start] === "(") return closingParenthesis(tokens, start);
  return start;
}

function group(tokens: string[], opening: number): string {
  const closing = closingParenthesis(tokens, opening);
  return closing < 0 ? escapeHtml(tokens.slice(opening).join("")) : formatTokens(tokens.slice(opening + 1, closing));
}

function formatTokens(tokens: string[]): string {
  const output: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "(") {
      const closing = closingParenthesis(tokens, index);
      if (closing < 0) return escapeHtml(tokens.join(""));
      output.push(`<span class="math-group">(${group(tokens, index)})</span>`);
      index = closing;
    } else if ((token === "sqrt" || token === "log" || token === "ln") && tokens[index + 1] === "(") {
      const firstClosing = closingParenthesis(tokens, index + 1);
      if (firstClosing < 0) return escapeHtml(tokens.join(""));
      if (token === "sqrt") {
        output.push(`<span class="math-root">√<span>${group(tokens, index + 1)}</span></span>`);
        index = firstClosing;
      } else if (token === "log" && tokens[firstClosing + 1] === "(") {
        const secondClosing = closingParenthesis(tokens, firstClosing + 1);
        if (secondClosing < 0) return escapeHtml(tokens.join(""));
        output.push(`<span class="math-log">log<sub>${group(tokens, index + 1)}</sub><span>${group(tokens, firstClosing + 1)}</span></span>`);
        index = secondClosing;
      } else {
        output.push(`<span class="math-function">${escapeHtml(token)}<span>${group(tokens, index + 1)}</span></span>`);
        index = firstClosing;
      }
    } else if (token === "root" && tokens[index + 1] === "(") {
      const indexClosing = closingParenthesis(tokens, index + 1);
      const argumentOpening = indexClosing + 1;
      const argumentClosing = closingParenthesis(tokens, argumentOpening);
      if (indexClosing < 0 || argumentClosing < 0 || tokens[argumentOpening] !== "(") return escapeHtml(tokens.join(""));
      output.push(`<span class="math-root nth-root"><sup>${group(tokens, index + 1)}</sup>√<span>${group(tokens, argumentOpening)}</span></span>`);
      index = argumentClosing;
    } else if (token === "^" && output.length > 0 && index + 1 < tokens.length) {
      const end = operandEnd(tokens, index + 1);
      output[output.length - 1] = `<span class="math-power">${output[output.length - 1]}<sup>${tokens[index + 1] === "(" ? group(tokens, index + 1) : escapeHtml(tokens[index + 1])}</sup></span>`;
      index = end;
    } else if (token === "/" && output.length > 0) {
      const end = index + 1 < tokens.length ? operandEnd(tokens, index + 1) : index;
      const denominator = index + 1 < tokens.length
        ? tokens[index + 1] === "(" ? group(tokens, index + 1) : escapeHtml(tokens[index + 1])
        : "";
      output[output.length - 1] = `<span class="math-fraction"><span>${output[output.length - 1]}</span><span>${denominator}</span></span>`;
      index = end;
    } else if (token === "!") {
      if (output.length > 0) output[output.length - 1] += "!";
    } else if (token === "pi") {
      output.push("π");
    } else {
      output.push(escapeHtml(token));
    }
  }
  return output.join(" ");
}

export function formatAsciiMath(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) return "";
  const tokens = tokenize(trimmed);
  return tokens ? formatTokens(tokens) : escapeHtml(trimmed);
}
