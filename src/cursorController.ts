import {
  MathNode,
  AstPath,
  AstPathStep,
  CharNode,
  FractionNode,
  ExponentNode,
  SqrtNode,
  LogNode,
  LnNode,
} from './mathAst';

export interface CursorState {
  activeRowIndex: number;
  astPath: AstPath;
  characterOffset: number;
}

export function getSlotNodes(rootNodes: MathNode[], path: AstPath): MathNode[] {
  let current = rootNodes;
  for (const step of path) {
    const parentNode = current[step.nodeIndex];
    if (!parentNode) return current;
    switch (step.slot) {
      case 'numerator':
        if (parentNode.type === 'fraction') current = parentNode.numerator;
        break;
      case 'denominator':
        if (parentNode.type === 'fraction') current = parentNode.denominator;
        break;
      case 'power':
        if (parentNode.type === 'exponent') current = parentNode.power;
        break;
      case 'radicand':
        if (parentNode.type === 'sqrt' || parentNode.type === 'root') current = parentNode.radicand;
        break;
      case 'index':
        if (parentNode.type === 'root') current = parentNode.index;
        break;
      case 'base':
        if (parentNode.type === 'log') current = parentNode.base;
        break;
      case 'argument':
        if (parentNode.type === 'log') current = parentNode.argument;
        else if (parentNode.type === 'ln') current = parentNode.argument;
        break;
    }
  }
  return current;
}

/**
 * Inserts a single character or symbol into the active slot at cursor.
 * Performs automated recognition for log, ln, sqrt, and pi.
 */
export function insertChar(rootNodes: MathNode[], cursor: CursorState, char: string): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  const node: CharNode = { type: 'char', value: char };
  slot.splice(cursor.characterOffset, 0, node);
  cursor.characterOffset++;

  checkAutomations(rootNodes, cursor);
}

/**
 * Checks for multi-letter automation triggers immediately after typing.
 */
function checkAutomations(rootNodes: MathNode[], cursor: CursorState): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  const offset = cursor.characterOffset;

  // 1. Check for "log" -> LogNode
  if (offset >= 3) {
    const n1 = slot[offset - 3];
    const n2 = slot[offset - 2];
    const n3 = slot[offset - 1];
    if (
      n1.type === 'char' && n1.value.toLowerCase() === 'l' &&
      n2.type === 'char' && n2.value.toLowerCase() === 'o' &&
      n3.type === 'char' && n3.value.toLowerCase() === 'g'
    ) {
      slot.splice(offset - 3, 3);
      const logNode: LogNode = {
        type: 'log',
        base: [],
        argument: [],
      };
      slot.splice(offset - 3, 0, logNode);
      cursor.astPath = [...cursor.astPath, { nodeIndex: offset - 3, slot: 'base' }];
      cursor.characterOffset = 0;
      return;
    }
  }

  // 2. Check for "ln" -> LnNode
  if (offset >= 2) {
    const n1 = slot[offset - 2];
    const n2 = slot[offset - 1];
    if (
      n1.type === 'char' && n1.value.toLowerCase() === 'l' &&
      n2.type === 'char' && n2.value.toLowerCase() === 'n'
    ) {
      slot.splice(offset - 2, 2);
      const lnNode: LnNode = {
        type: 'ln',
        argument: [],
      };
      slot.splice(offset - 2, 0, lnNode);
      cursor.astPath = [...cursor.astPath, { nodeIndex: offset - 2, slot: 'argument' }];
      cursor.characterOffset = 0;
      return;
    }
  }

  // 3. Check for "sqrt" -> SqrtNode
  if (offset >= 4) {
    const n1 = slot[offset - 4];
    const n2 = slot[offset - 3];
    const n3 = slot[offset - 2];
    const n4 = slot[offset - 1];
    if (
      n1.type === 'char' && n1.value.toLowerCase() === 's' &&
      n2.type === 'char' && n2.value.toLowerCase() === 'q' &&
      n3.type === 'char' && n3.value.toLowerCase() === 'r' &&
      n4.type === 'char' && n4.value.toLowerCase() === 't'
    ) {
      slot.splice(offset - 4, 4);
      const sqrtNode: SqrtNode = {
        type: 'sqrt',
        radicand: [],
      };
      slot.splice(offset - 4, 0, sqrtNode);
      cursor.astPath = [...cursor.astPath, { nodeIndex: offset - 4, slot: 'radicand' }];
      cursor.characterOffset = 0;
      return;
    }
  }

  // 4. Check for "pi" -> CharNode('π')
  if (offset >= 2) {
    const n1 = slot[offset - 2];
    const n2 = slot[offset - 1];
    if (
      n1.type === 'char' && n1.value.toLowerCase() === 'p' &&
      n2.type === 'char' && n2.value.toLowerCase() === 'i'
    ) {
      slot.splice(offset - 2, 2, { type: 'char', value: 'π' });
      cursor.characterOffset = offset - 1;
      return;
    }
  }
}

/**
 * Triggers stacked fraction on '/' input.
 * Extracts the preceding operand/group as numerator (or empty if none).
 */
export function insertFraction(rootNodes: MathNode[], cursor: CursorState): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  let numerator: MathNode[] = [];
  let insertIndex = cursor.characterOffset;

  if (cursor.characterOffset > 0) {
    const prev = slot[cursor.characterOffset - 1];

    if (prev.type === 'char' && prev.value === ')') {
      // Find matching '('
      let depth = 1;
      let startIdx = cursor.characterOffset - 2;
      while (startIdx >= 0) {
        const cur = slot[startIdx];
        if (cur.type === 'char' && cur.value === ')') depth++;
        else if (cur.type === 'char' && cur.value === '(') {
          depth--;
          if (depth === 0) break;
        }
        startIdx--;
      }
      if (startIdx >= 0) {
        // Extract content between parens or including parens
        numerator = slot.splice(startIdx, cursor.characterOffset - startIdx);
        insertIndex = startIdx;
      } else {
        numerator = slot.splice(cursor.characterOffset - 1, 1);
        insertIndex = cursor.characterOffset - 1;
      }
    } else if (prev.type === 'char' && isDigitOrLetter(prev.value)) {
      // Collect consecutive alphanumeric / decimal chars
      let startIdx = cursor.characterOffset - 1;
      while (startIdx >= 0) {
        const cur = slot[startIdx];
        if (cur.type === 'char' && (isDigitOrLetter(cur.value) || cur.value === '.')) {
          startIdx--;
        } else {
          break;
        }
      }
      const count = cursor.characterOffset - (startIdx + 1);
      numerator = slot.splice(startIdx + 1, count);
      insertIndex = startIdx + 1;
    } else {
      // Single previous node
      numerator = slot.splice(cursor.characterOffset - 1, 1);
      insertIndex = cursor.characterOffset - 1;
    }
  }

  const fracNode: FractionNode = {
    type: 'fraction',
    numerator,
    denominator: [],
  };

  slot.splice(insertIndex, 0, fracNode);
  cursor.astPath = [...cursor.astPath, { nodeIndex: insertIndex, slot: 'denominator' }];
  cursor.characterOffset = 0;
}

/**
 * Triggers exponent on '^' input.
 */
export function insertExponent(rootNodes: MathNode[], cursor: CursorState): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  const expNode: ExponentNode = {
    type: 'exponent',
    power: [],
  };

  const insertIndex = cursor.characterOffset;
  slot.splice(insertIndex, 0, expNode);
  cursor.astPath = [...cursor.astPath, { nodeIndex: insertIndex, slot: 'power' }];
  cursor.characterOffset = 0;
}

/**
 * Inserts exactly one deterministic parenthesis node.
 */
export function insertParenthesis(rootNodes: MathNode[], cursor: CursorState, paren: '(' | ')'): void {
  insertChar(rootNodes, cursor, paren);
}

/**
 * Handles backspace deletion.
 */
export function deleteBackward(
  rootNodes: MathNode[],
  cursor: CursorState,
  onRemoveRow?: () => void,
): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  if (cursor.characterOffset > 0) {
    const targetIdx = cursor.characterOffset - 1;
    const targetNode = slot[targetIdx];

    if (isContainerNode(targetNode)) {
      // If container is empty, remove it
      if (isContainerEmpty(targetNode)) {
        slot.splice(targetIdx, 1);
        cursor.characterOffset = targetIdx;
      } else {
        // Enter the last slot of the container
        const lastSlot = getLastSlotName(targetNode);
        cursor.astPath = [...cursor.astPath, { nodeIndex: targetIdx, slot: lastSlot }];
        const innerNodes = getSlotNodes(rootNodes, cursor.astPath);
        cursor.characterOffset = innerNodes.length;
      }
    } else {
      slot.splice(targetIdx, 1);
      cursor.characterOffset = targetIdx;
    }
  } else {
    // Offset is 0
    if (cursor.astPath.length > 0) {
      // Pop out of the current slot into parent
      const lastStep = cursor.astPath[cursor.astPath.length - 1];
      cursor.astPath = cursor.astPath.slice(0, -1);
      cursor.characterOffset = lastStep.nodeIndex;
    } else {
      // At the root of row with offset 0 and empty row
      if (slot.length === 0 && onRemoveRow) {
        onRemoveRow();
      }
    }
  }
}

/**
 * Moves cursor right.
 * Handles the special rule: If inside LogNode.base and base is empty,
 * pressing Right Arrow jumps into argument (default Base 10 fallback).
 */
export function moveRight(rootNodes: MathNode[], cursor: CursorState): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  // Check if we are in LogNode.base and base is empty
  if (cursor.astPath.length > 0) {
    const lastStep = cursor.astPath[cursor.astPath.length - 1];
    if (lastStep.slot === 'base' && slot.length === 0) {
      // Jump to argument slot!
      cursor.astPath[cursor.astPath.length - 1] = {
        nodeIndex: lastStep.nodeIndex,
        slot: 'argument',
      };
      cursor.characterOffset = 0;
      return;
    }
  }

  if (cursor.characterOffset < slot.length) {
    const nextNode = slot[cursor.characterOffset];
    if (isContainerNode(nextNode)) {
      // Enter the first slot of the container
      const firstSlot = getFirstSlotName(nextNode);
      cursor.astPath = [
        ...cursor.astPath,
        { nodeIndex: cursor.characterOffset, slot: firstSlot },
      ];
      cursor.characterOffset = 0;
    } else {
      cursor.characterOffset++;
    }
  } else {
    // At end of slot
    if (cursor.astPath.length > 0) {
      const lastStep = cursor.astPath[cursor.astPath.length - 1];
      const parentPath = cursor.astPath.slice(0, -1);
      const parentSlot = getSlotNodes(rootNodes, parentPath);
      const container = parentSlot[lastStep.nodeIndex];

      if (container && container.type === 'fraction' && lastStep.slot === 'numerator') {
        // Jump to denominator
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'denominator',
        };
        cursor.characterOffset = 0;
      } else if (container && container.type === 'log' && lastStep.slot === 'base') {
        // Jump to argument
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'argument',
        };
        cursor.characterOffset = 0;
      } else if (container && container.type === 'root' && lastStep.slot === 'index') {
        // Jump to radicand
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'radicand',
        };
        cursor.characterOffset = 0;
      } else {
        // Exit container to the right
        cursor.astPath = parentPath;
        cursor.characterOffset = lastStep.nodeIndex + 1;
      }
    }
  }
}

/**
 * Moves cursor left.
 */
export function moveLeft(rootNodes: MathNode[], cursor: CursorState): void {
  const slot = getSlotNodes(rootNodes, cursor.astPath);
  clampOffset(slot, cursor);

  if (cursor.characterOffset > 0) {
    const prevNode = slot[cursor.characterOffset - 1];
    if (isContainerNode(prevNode)) {
      // Enter the last slot of the container at its end
      const lastSlot = getLastSlotName(prevNode);
      cursor.astPath = [
        ...cursor.astPath,
        { nodeIndex: cursor.characterOffset - 1, slot: lastSlot },
      ];
      const innerSlot = getSlotNodes(rootNodes, cursor.astPath);
      cursor.characterOffset = innerSlot.length;
    } else {
      cursor.characterOffset--;
    }
  } else {
    // At start of slot
    if (cursor.astPath.length > 0) {
      const lastStep = cursor.astPath[cursor.astPath.length - 1];
      const parentPath = cursor.astPath.slice(0, -1);
      const parentSlot = getSlotNodes(rootNodes, parentPath);
      const container = parentSlot[lastStep.nodeIndex];

      if (container && container.type === 'fraction' && lastStep.slot === 'denominator') {
        // Jump to numerator
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'numerator',
        };
        const numSlot = getSlotNodes(rootNodes, cursor.astPath);
        cursor.characterOffset = numSlot.length;
      } else if (container && container.type === 'log' && lastStep.slot === 'argument') {
        // Jump to base
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'base',
        };
        const baseSlot = getSlotNodes(rootNodes, cursor.astPath);
        cursor.characterOffset = baseSlot.length;
      } else if (container && container.type === 'root' && lastStep.slot === 'radicand') {
        // Jump to index
        cursor.astPath[cursor.astPath.length - 1] = {
          nodeIndex: lastStep.nodeIndex,
          slot: 'index',
        };
        const idxSlot = getSlotNodes(rootNodes, cursor.astPath);
        cursor.characterOffset = idxSlot.length;
      } else {
        // Exit container to the left
        cursor.astPath = parentPath;
        cursor.characterOffset = lastStep.nodeIndex;
      }
    }
  }
}

/**
 * Handles Tab key. If in LogNode.base and base is empty, jumps to argument.
 * Otherwise cycles through slots.
 */
export function tabNext(_rootNodes: MathNode[], cursor: CursorState): boolean {
  if (cursor.astPath.length > 0) {
    const lastStep = cursor.astPath[cursor.astPath.length - 1];
    if (lastStep.slot === 'base') {
      cursor.astPath[cursor.astPath.length - 1] = {
        nodeIndex: lastStep.nodeIndex,
        slot: 'argument',
      };
      cursor.characterOffset = 0;
      return true;
    }
    if (lastStep.slot === 'numerator') {
      cursor.astPath[cursor.astPath.length - 1] = {
        nodeIndex: lastStep.nodeIndex,
        slot: 'denominator',
      };
      cursor.characterOffset = 0;
      return true;
    }
  }
  return false;
}

/**
 * Moves cursor vertically (Up arrow).
 * Returns true if handled internally (e.g. within fraction).
 */
export function moveUp(rootNodes: MathNode[], cursor: CursorState): boolean {
  if (cursor.astPath.length > 0) {
    const lastStep = cursor.astPath[cursor.astPath.length - 1];
    if (lastStep.slot === 'denominator') {
      cursor.astPath[cursor.astPath.length - 1] = {
        nodeIndex: lastStep.nodeIndex,
        slot: 'numerator',
      };
      const numSlot = getSlotNodes(rootNodes, cursor.astPath);
      cursor.characterOffset = Math.min(cursor.characterOffset, numSlot.length);
      return true;
    }
  }
  return false;
}

/**
 * Moves cursor vertically (Down arrow).
 * Returns true if handled internally (e.g. within fraction).
 */
export function moveDown(rootNodes: MathNode[], cursor: CursorState): boolean {
  if (cursor.astPath.length > 0) {
    const lastStep = cursor.astPath[cursor.astPath.length - 1];
    if (lastStep.slot === 'numerator') {
      cursor.astPath[cursor.astPath.length - 1] = {
        nodeIndex: lastStep.nodeIndex,
        slot: 'denominator',
      };
      const denSlot = getSlotNodes(rootNodes, cursor.astPath);
      cursor.characterOffset = Math.min(cursor.characterOffset, denSlot.length);
      return true;
    }
  }
  return false;
}

function clampOffset(slot: MathNode[], cursor: CursorState): void {
  if (cursor.characterOffset < 0) cursor.characterOffset = 0;
  if (cursor.characterOffset > slot.length) cursor.characterOffset = slot.length;
}

function isDigitOrLetter(str: string): boolean {
  return /^[0-9a-zA-Zπ]$/.test(str);
}

function isContainerNode(node: MathNode): boolean {
  return node.type !== 'char';
}

function isContainerEmpty(node: MathNode): boolean {
  switch (node.type) {
    case 'fraction':
      return node.numerator.length === 0 && node.denominator.length === 0;
    case 'exponent':
      return node.power.length === 0;
    case 'sqrt':
      return node.radicand.length === 0;
    case 'root':
      return node.index.length === 0 && node.radicand.length === 0;
    case 'log':
      return node.base.length === 0 && node.argument.length === 0;
    case 'ln':
      return node.argument.length === 0;
    default:
      return false;
  }
}

function getFirstSlotName(node: MathNode): AstPathStep['slot'] {
  switch (node.type) {
    case 'fraction': return 'numerator';
    case 'exponent': return 'power';
    case 'sqrt': return 'radicand';
    case 'root': return 'index';
    case 'log': return 'base';
    case 'ln': return 'argument';
    default: return 'numerator';
  }
}

function getLastSlotName(node: MathNode): AstPathStep['slot'] {
  switch (node.type) {
    case 'fraction': return 'denominator';
    case 'exponent': return 'power';
    case 'sqrt': return 'radicand';
    case 'root': return 'radicand';
    case 'log': return 'argument';
    case 'ln': return 'argument';
    default: return 'numerator';
  }
}
