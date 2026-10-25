const tokenPattern = /(\d+(?:\.\d+)?|\.\d+|[A-Za-z]+|[()+\-*/^!])/g;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

export function formatAsciiMath(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) {
    return "";
  }

  const tokens = trimmed.match(tokenPattern);
  if (!tokens || tokens.join("").replace(/\s/g, "") !== trimmed.replace(/\s/g, "")) {
    return escapeHtml(trimmed);
  }

  const output: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "sqrt" || token === "log" || token === "ln") && tokens[index + 1] === "(") {
      if (token !== "sqrt") {
        output.push(`<span class="math-function">${escapeHtml(token)}<span>${formatAsciiMath(
          collectParenthesized(tokens, index + 1),
        )}</span></span>`);
        index = findClosingParenthesis(tokens, index + 1);
      } else {
      output.push(`<span class="math-root">√<span>${formatAsciiMath(
        collectParenthesized(tokens, index + 1),
      )}</span></span>`);
      index = findClosingParenthesis(tokens, index + 1);
      }
    } else if (token === "root" && tokens[index + 1] === "(") {
      const indexEnd = findClosingParenthesis(tokens, index + 1);
      if (tokens[indexEnd + 1] === "(") {
        output.push(
          `<span class="math-root nth-root"><sup>${formatAsciiMath(
            tokens.slice(index + 2, indexEnd).join(""),
          )}</sup>√<span>${formatAsciiMath(
            collectParenthesized(tokens, indexEnd + 1),
          )}</span></span>`,
        );
        index = findClosingParenthesis(tokens, indexEnd + 1);
      } else {
        output.push(escapeHtml(token));
      }
    } else if (token === "^" && output.length > 0 && index + 1 < tokens.length) {
      output[output.length - 1] = `<span class="math-power">${output[
        output.length - 1
      ]}<sup>${escapeHtml(tokens[index + 1])}</sup></span>`;
      index += 1;
    } else if (token === "!" && output.length > 0) {
      output[output.length - 1] += "!";
    } else if (token === "pi") {
      output.push("π");
    } else if (token === "/" && index > 0 && index + 1 < tokens.length) {
      output[output.length - 1] = `<span class="math-fraction"><span>${output[
        output.length - 1
      ]}</span><span>${escapeHtml(tokens[index + 1])}</span></span>`;
      index += 1;
    } else {
      output.push(escapeHtml(token));
    }
  }
  return output.join(" ");
}

function findClosingParenthesis(tokens: string[], opening: number): number {
  let depth = 0;
  for (let index = opening; index < tokens.length; index += 1) {
    if (tokens[index] === "(") depth += 1;
    if (tokens[index] === ")" && --depth === 0) return index;
  }
  return tokens.length - 1;
}

function collectParenthesized(tokens: string[], opening: number): string {
  const closing = findClosingParenthesis(tokens, opening);
  return tokens.slice(opening + 1, closing).join("");
}
