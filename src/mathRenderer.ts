import { MathNode, AstPath, isSamePath, astPathToString } from './mathAst';
import { CursorState } from './cursorController';

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

/**
 * Renders an entire expression row's AST to HTML.
 */
export function renderExpression(
  rootNodes: MathNode[],
  cursor: CursorState,
  isRowFocused: boolean,
): string {
  if (rootNodes.length === 0) {
    if (isRowFocused) {
      return `<span class="math-slot root-empty focused" data-path=""><span class="math-cursor"></span><span class="math-placeholder">Type an expression</span></span>`;
    }
    return `<span class="math-slot root-empty" data-path=""><span class="math-placeholder">Type an expression</span></span>`;
  }

  return renderSlot(rootNodes, [], cursor, isRowFocused);
}

/**
 * Renders a specific slot's nodes to HTML.
 */
export function renderSlot(
  nodes: MathNode[],
  currentPath: AstPath,
  cursor: CursorState,
  isRowFocused: boolean,
): string {
  const isHere = isRowFocused && isSamePath(cursor.astPath, currentPath);
  const pathStr = astPathToString(currentPath);

  if (nodes.length === 0) {
    if (isHere) {
      return `<span class="math-slot empty focused" data-path="${pathStr}"><span class="math-cursor"></span></span>`;
    }
    return `<span class="math-slot empty" data-path="${pathStr}"></span>`;
  }

  const parts: string[] = [];

  for (let i = 0; i <= nodes.length; i++) {
    if (isHere && cursor.characterOffset === i) {
      parts.push(`<span class="math-cursor"></span>`);
    }

    if (i < nodes.length) {
      const node = nodes[i];
      parts.push(renderNode(node, currentPath, i, cursor, isRowFocused));
    }
  }

  return parts.join('');
}

function renderNode(
  node: MathNode,
  parentPath: AstPath,
  nodeIndex: number,
  cursor: CursorState,
  isRowFocused: boolean,
): string {
  switch (node.type) {
    case 'char': {
      const isOperator = ['+', '-', '*', '=', '<', '>'].includes(node.value);
      const isParen = node.value === '(' || node.value === ')';
      const isFactorial = node.value === '!';
      let className = 'math-char';
      if (isOperator) className += ' math-operator';
      if (isParen) className += ' math-paren';
      if (isFactorial) className += ' math-factorial';
      return `<span class="${className}">${escapeHtml(node.value)}</span>`;
    }

    case 'fraction': {
      const numPath = [...parentPath, { nodeIndex, slot: 'numerator' as const }];
      const denPath = [...parentPath, { nodeIndex, slot: 'denominator' as const }];
      const numHtml = renderSlot(node.numerator, numPath, cursor, isRowFocused);
      const denHtml = renderSlot(node.denominator, denPath, cursor, isRowFocused);

      return `<span class="math-fraction">
        <span class="math-numerator" data-path="${astPathToString(numPath)}">${numHtml}</span>
        <span class="math-fraction-line"></span>
        <span class="math-denominator" data-path="${astPathToString(denPath)}">${denHtml}</span>
      </span>`;
    }

    case 'exponent': {
      const powerPath = [...parentPath, { nodeIndex, slot: 'power' as const }];
      const powerHtml = renderSlot(node.power, powerPath, cursor, isRowFocused);

      return `<span class="math-exponent">
        <sup class="math-exponent-power" data-path="${astPathToString(powerPath)}">${powerHtml}</sup>
      </span>`;
    }

    case 'sqrt': {
      const radPath = [...parentPath, { nodeIndex, slot: 'radicand' as const }];
      const radHtml = renderSlot(node.radicand, radPath, cursor, isRowFocused);

      return `<span class="math-sqrt">
        <span class="math-sqrt-radical">√</span>
        <span class="math-sqrt-content" data-path="${astPathToString(radPath)}">${radHtml}</span>
      </span>`;
    }

    case 'root': {
      const idxPath = [...parentPath, { nodeIndex, slot: 'index' as const }];
      const radPath = [...parentPath, { nodeIndex, slot: 'radicand' as const }];
      const idxHtml = renderSlot(node.index, idxPath, cursor, isRowFocused);
      const radHtml = renderSlot(node.radicand, radPath, cursor, isRowFocused);

      return `<span class="math-root">
        <sup class="math-root-index" data-path="${astPathToString(idxPath)}">${idxHtml}</sup>
        <span class="math-sqrt-radical">√</span>
        <span class="math-sqrt-content" data-path="${astPathToString(radPath)}">${radHtml}</span>
      </span>`;
    }

    case 'log': {
      const basePath = [...parentPath, { nodeIndex, slot: 'base' as const }];
      const argPath = [...parentPath, { nodeIndex, slot: 'argument' as const }];
      const isBaseFocused = isRowFocused && isSamePath(cursor.astPath, basePath);
      const shouldShowBase = node.base.length > 0 || isBaseFocused;

      const baseHtml = shouldShowBase
        ? `<sub class="math-log-base" data-path="${astPathToString(basePath)}">${renderSlot(node.base, basePath, cursor, isRowFocused)}</sub>`
        : '';
      const argHtml = renderSlot(node.argument, argPath, cursor, isRowFocused);

      return `<span class="math-log-block">
        <span class="math-word">log</span>${baseHtml}
        <span class="math-paren">(</span><span class="math-log-arg" data-path="${astPathToString(argPath)}">${argHtml}</span><span class="math-paren">)</span>
      </span>`;
    }

    case 'ln': {
      const argPath = [...parentPath, { nodeIndex, slot: 'argument' as const }];
      const argHtml = renderSlot(node.argument, argPath, cursor, isRowFocused);

      return `<span class="math-ln-block">
        <span class="math-word">ln</span>
        <span class="math-paren">(</span><span class="math-ln-arg" data-path="${astPathToString(argPath)}">${argHtml}</span><span class="math-paren">)</span>
      </span>`;
    }
  }
}
