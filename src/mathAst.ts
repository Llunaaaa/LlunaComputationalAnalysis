export type MathNode =
  | CharNode
  | FractionNode
  | ExponentNode
  | SqrtNode
  | NthRootNode
  | LogNode
  | LnNode;

export interface CharNode {
  type: 'char';
  value: string;
}

export interface FractionNode {
  type: 'fraction';
  numerator: MathNode[];
  denominator: MathNode[];
}

export interface ExponentNode {
  type: 'exponent';
  power: MathNode[];
}

export interface SqrtNode {
  type: 'sqrt';
  radicand: MathNode[];
}

export interface NthRootNode {
  type: 'root';
  index: MathNode[];
  radicand: MathNode[];
}

export interface LogNode {
  type: 'log';
  base: MathNode[]; // empty array means default base 10
  argument: MathNode[];
}

export interface LnNode {
  type: 'ln';
  argument: MathNode[];
}

export interface AstPathStep {
  nodeIndex: number;
  slot: 'numerator' | 'denominator' | 'power' | 'radicand' | 'index' | 'base' | 'argument';
}

export type AstPath = AstPathStep[];

export function astPathToString(path: AstPath): string {
  return path.map((step) => `${step.nodeIndex}:${step.slot}`).join('/');
}

export function stringToAstPath(str: string): AstPath {
  if (!str) return [];
  return str.split('/').map((part) => {
    const [indexStr, slot] = part.split(':');
    return {
      nodeIndex: parseInt(indexStr, 10),
      slot: slot as AstPathStep['slot'],
    };
  });
}

export function isSamePath(a: AstPath, b: AstPath): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].nodeIndex !== b[i].nodeIndex || a[i].slot !== b[i].slot) {
      return false;
    }
  }
  return true;
}

export function cloneNodes(nodes: MathNode[]): MathNode[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'char':
        return { type: 'char', value: node.value };
      case 'fraction':
        return {
          type: 'fraction',
          numerator: cloneNodes(node.numerator),
          denominator: cloneNodes(node.denominator),
        };
      case 'exponent':
        return {
          type: 'exponent',
          power: cloneNodes(node.power),
        };
      case 'sqrt':
        return {
          type: 'sqrt',
          radicand: cloneNodes(node.radicand),
        };
      case 'root':
        return {
          type: 'root',
          index: cloneNodes(node.index),
          radicand: cloneNodes(node.radicand),
        };
      case 'log':
        return {
          type: 'log',
          base: cloneNodes(node.base),
          argument: cloneNodes(node.argument),
        };
      case 'ln':
        return {
          type: 'ln',
          argument: cloneNodes(node.argument),
        };
    }
  });
}

export function areNodesEmpty(nodes: MathNode[]): boolean {
  return nodes.length === 0;
}

/**
 * Serializes the AST into a mathematical expression string for the native C++ engine.
 */
export function serializeToEngine(nodes: MathNode[]): string {
  if (nodes.length === 0) return '';
  let result = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'char':
        if (node.value === 'π') result += 'pi';
        else result += node.value;
        break;
      case 'fraction': {
        const num = serializeToEngine(node.numerator) || '0';
        const den = serializeToEngine(node.denominator) || '1';
        result += `((${num})/(${den}))`;
        break;
      }
      case 'exponent': {
        const power = serializeToEngine(node.power) || '1';
        result += `^(${power})`;
        break;
      }
      case 'sqrt': {
        const rad = serializeToEngine(node.radicand) || '0';
        result += `sqrt(${rad})`;
        break;
      }
      case 'root': {
        const idx = serializeToEngine(node.index) || '2';
        const rad = serializeToEngine(node.radicand) || '0';
        result += `root(${idx})(${rad})`;
        break;
      }
      case 'log': {
        const arg = serializeToEngine(node.argument) || '1';
        const base = serializeToEngine(node.base);
        if (!base || base === '10') {
          result += `log(${arg})`;
        } else {
          result += `log(${base})(${arg})`;
        }
        break;
      }
      case 'ln': {
        const arg = serializeToEngine(node.argument) || '1';
        result += `ln(${arg})`;
        break;
      }
    }
  }
  return result;
}

/**
 * Parses a plain text expression (like "3^(2-6)" or "sqrt(16)") into an AST.
 */
export function parsePlainText(text: string): MathNode[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tokens = tokenizePlainText(trimmed);
  let pos = 0;

  function parseSequence(): MathNode[] {
    const list: MathNode[] = [];
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok === ')' || tok === ',') {
        break;
      }
      if (tok === '/') {
        pos++;
        // Everything collected so far or previous factor becomes numerator
        const numerator = list.splice(0, list.length);
        const denominator = parseFactor();
        list.push({
          type: 'fraction',
          numerator: numerator.length > 0 ? numerator : [{ type: 'char', value: '1' }],
          denominator,
        });
      } else if (tok === '^') {
        pos++;
        const power = parseFactor();
        list.push({
          type: 'exponent',
          power,
        });
      } else {
        const factor = parseFactor();
        list.push(...factor);
      }
    }
    return list;
  }

  function parseFactor(): MathNode[] {
    if (pos >= tokens.length) return [];
    const tok = tokens[pos];

    if (tok === 'sqrt') {
      pos++;
      if (pos < tokens.length && tokens[pos] === '(') {
        pos++; // consume '('
        const rad = parseSequence();
        if (pos < tokens.length && tokens[pos] === ')') pos++; // consume ')'
        return [{ type: 'sqrt', radicand: rad }];
      }
      return [{ type: 'sqrt', radicand: [] }];
    }

    if (tok === 'root') {
      pos++;
      let index: MathNode[] = [];
      let rad: MathNode[] = [];
      if (pos < tokens.length && tokens[pos] === '(') {
        pos++;
        index = parseSequence();
        if (pos < tokens.length && tokens[pos] === ')') pos++;
      }
      if (pos < tokens.length && tokens[pos] === '(') {
        pos++;
        rad = parseSequence();
        if (pos < tokens.length && tokens[pos] === ')') pos++;
      }
      return [{ type: 'root', index, radicand: rad }];
    }

    if (tok === 'log') {
      pos++;
      let base: MathNode[] = [];
      let arg: MathNode[] = [];
      if (pos < tokens.length && tokens[pos] === '(') {
        pos++;
        const first = parseSequence();
        if (pos < tokens.length && tokens[pos] === ')') pos++;
        if (pos < tokens.length && tokens[pos] === '(') {
          pos++;
          arg = parseSequence();
          if (pos < tokens.length && tokens[pos] === ')') pos++;
          base = first;
        } else {
          arg = first;
        }
      }
      return [{ type: 'log', base, argument: arg }];
    }

    if (tok === 'ln') {
      pos++;
      let arg: MathNode[] = [];
      if (pos < tokens.length && tokens[pos] === '(') {
        pos++;
        arg = parseSequence();
        if (pos < tokens.length && tokens[pos] === ')') pos++;
      }
      return [{ type: 'ln', argument: arg }];
    }

    if (tok === '(') {
      pos++;
      const inner = parseSequence();
      if (pos < tokens.length && tokens[pos] === ')') pos++;
      return [{ type: 'char', value: '(' }, ...inner, { type: 'char', value: ')' }];
    }

    if (tok === 'pi' || tok === 'π') {
      pos++;
      return [{ type: 'char', value: 'π' }];
    }

    if (tok === 'e') {
      pos++;
      return [{ type: 'char', value: 'e' }];
    }

    pos++;
    return tok.split('').map((char) => ({ type: 'char', value: char }));
  }

  return parseSequence();
}

function tokenizePlainText(text: string): string[] {
  const result: string[] = [];
  const regex = /\s*(\d+(?:\.\d+)?|\.\d+|sqrt|root|log|ln|pi|π|[A-Za-z]|[()+\-*/^!])\s*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    result.push(match[1]);
  }
  return result;
}
