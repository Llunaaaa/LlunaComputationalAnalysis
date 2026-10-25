import { invoke } from '@tauri-apps/api/core';
import './styles.css';
import {
  MathNode,
  parsePlainText,
  serializeToEngine,
  stringToAstPath,
} from './mathAst';
import {
  CursorState,
  insertChar,
  insertFraction,
  insertExponent,
  insertParenthesis,
  deleteBackward,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  tabNext,
  getSlotNodes,
} from './cursorController';
import { renderExpression } from './mathRenderer';

const sections = [
  'Home',
  'Arithmetic',
  'Functions',
  'Table',
  'Graph',
  'Algebra',
  'Systems',
  'Trigonometry',
  'Matrices',
  'Calculus',
  'Statistics',
  'Probability',
  'Geometry',
  'Financial',
] as const;

type Section = (typeof sections)[number];

interface Evaluation {
  value: number | null;
  exact: string | null;
  error: string | null;
}

export interface ExpressionRow {
  id: number;
  nodes: MathNode[];
  evaluation: Evaluation | null;
  evaluating: boolean;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root was not found');

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Application sections">
      <div class="sidebar-heading">
        <p class="eyebrow logo-mark">LLUNA</p>
        <h1>Computational Analysis</h1>
      </div>
      <nav class="section-list">
        ${sections
          .map(
            (section) => `
              <button class="section-button" type="button" data-section="${section}">
                ${section}
              </button>
            `,
          )
          .join('')}
      </nav>
    </aside>
    <section class="page-area">
      <header class="page-header">
        <span class="page-kicker">Windows 11 preview</span>
      </header>
      <div id="page-content" class="page-content" aria-live="polite"></div>
    </section>
  </main>
`;

const pageElement = document.querySelector<HTMLDivElement>('#page-content');
const sectionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.section-button'));
if (!pageElement || sectionButtons.length !== sections.length) {
  throw new Error('Application navigation was not initialized');
}
const page = pageElement;

let currentSection: Section = 'Home';
let nextRowId = 3;

// Multi-Row Invariant: ALWAYS at least 2 active expression rows present at all times.
// There must always be an active, empty, numbered row at the bottom ready for input.
const rows: ExpressionRow[] = [
  { id: 1, nodes: parsePlainText('3^(2-6)'), evaluation: null, evaluating: false },
  { id: 2, nodes: [], evaluation: null, evaluating: false },
];

const cursor: CursorState = {
  activeRowIndex: 1, // Focus the bottom empty row ready for input
  astPath: [],
  characterOffset: 0,
};

function ensureInvariants() {
  // 1. Minimum 2 rows
  while (rows.length < 2) {
    rows.push({ id: nextRowId++, nodes: [], evaluation: null, evaluating: false });
  }

  // 2. Trailing blank row invariant: bottom row must be empty
  const lastRow = rows[rows.length - 1];
  if (lastRow.nodes.length > 0) {
    rows.push({ id: nextRowId++, nodes: [], evaluation: null, evaluating: false });
  }

  // Clamp activeRowIndex
  if (cursor.activeRowIndex < 0) cursor.activeRowIndex = 0;
  if (cursor.activeRowIndex >= rows.length) cursor.activeRowIndex = rows.length - 1;
}

function renderPage(section: Section) {
  currentSection = section;

  for (const button of sectionButtons) {
    const isActive = button.dataset.section === section;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  if (section === 'Arithmetic') {
    renderArithmetic();
  } else {
    page.innerHTML = `
      <div class="empty-page">
        <p class="eyebrow">${section}</p>
        <h2>This is where I'll add ${section} content soon.</h2>
      </div>
    `;
  }
}

function renderArithmetic() {
  ensureInvariants();

  page.innerHTML = `
    <div class="arithmetic-container" tabindex="0" aria-label="Arithmetic workspace">
      <div class="arithmetic-toolbar">
        <span class="arithmetic-toolbar-title">Arithmetic Workspace</span>
        <button class="add-expression-btn" type="button" id="add-expr-btn">
          <span>+</span> Add expression
        </button>
      </div>
      <div class="expression-stack" id="expr-stack">
        ${rows.map((row, idx) => renderRowHtml(row, idx)).join('')}
      </div>
    </div>
  `;

  attachArithmeticEventListeners();
  scrollStackToBottom();
}

function renderRowHtml(row: ExpressionRow, index: number): string {
  const isFocused = cursor.activeRowIndex === index;
  const canDelete = rows.length > 2;

  let resultHtml = '';
  if (row.evaluating) {
    resultHtml = 'Evaluating…';
  } else if (row.evaluation?.error) {
    resultHtml = `<span class="has-error">Error: ${escapeHtml(row.evaluation.error)}</span>`;
  } else if (row.evaluation?.value !== null && row.evaluation?.value !== undefined) {
    const val = row.evaluation.value;
    const exact = row.evaluation.exact;
    const formattedVal = Number.isInteger(val) ? String(val) : String(val);
    if (exact && !isPlainNumber(exact)) {
      resultHtml = `<span>${escapeHtml(exact)}</span> <span style="color:#727870">≈</span> <span>${formattedVal}</span>`;
    } else {
      resultHtml = `= ${formattedVal}`;
    }
  }

  return `
    <article class="expression-row ${isFocused ? 'active' : ''}" data-row-index="${index}">
      <div class="expression-row-main">
        <span class="row-number">${index + 1}</span>
        <div class="expression-editor-area" data-row-index="${index}">
          ${renderExpression(row.nodes, cursor, isFocused)}
        </div>
        <button
          class="row-delete-btn"
          type="button"
          data-delete-row="${index}"
          title="${canDelete ? 'Delete row' : 'Minimum 2 rows required'}"
          ${canDelete ? '' : 'disabled'}
        >×</button>
      </div>
      ${resultHtml ? `<div class="expression-row-result">${resultHtml}</div>` : ''}
    </article>
  `;
}

function attachArithmeticEventListeners() {
  const container = page.querySelector<HTMLDivElement>('.arithmetic-container');
  if (!container) return;

  // Add expression button
  const addBtn = page.querySelector<HTMLButtonElement>('#add-expr-btn');
  addBtn?.addEventListener('click', () => {
    ensureInvariants();
    // Focus the bottom row
    cursor.activeRowIndex = rows.length - 1;
    cursor.astPath = [];
    cursor.characterOffset = 0;
    renderArithmetic();
  });

  // Delete buttons
  const deleteButtons = page.querySelectorAll<HTMLButtonElement>('[data-delete-row]');
  deleteButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIdx = parseInt(btn.dataset.deleteRow || '0', 10);
      deleteRow(rowIdx);
    });
  });

  // Click on expression editor areas
  const editorAreas = page.querySelectorAll<HTMLDivElement>('.expression-editor-area');
  editorAreas.forEach((area) => {
    area.addEventListener('mousedown', (e) => {
      const rowIdx = parseInt(area.dataset.rowIndex || '0', 10);
      cursor.activeRowIndex = rowIdx;

      const target = e.target as HTMLElement;
      const slotEl = target.closest<HTMLElement>('[data-path]');
      if (slotEl && slotEl.dataset.path !== undefined) {
        cursor.astPath = stringToAstPath(slotEl.dataset.path);
        const slotNodes = getSlotNodes(rows[rowIdx].nodes, cursor.astPath);
        cursor.characterOffset = slotNodes.length;
      } else {
        cursor.astPath = [];
        cursor.characterOffset = rows[rowIdx].nodes.length;
      }

      renderArithmetic();
      container.focus();
    });
  });

  // Keydown event listener on container
  container.addEventListener('keydown', handleKeydown);
  container.focus();
}

function handleKeydown(e: KeyboardEvent) {
  const row = rows[cursor.activeRowIndex];
  if (!row) return;

  // Ignore navigation shortcuts (Ctrl+R, F12, etc.)
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  let prevent = true;

  switch (e.key) {
    case 'ArrowLeft':
      moveLeft(row.nodes, cursor);
      break;

    case 'ArrowRight':
      moveRight(row.nodes, cursor);
      break;

    case 'ArrowUp': {
      const handled = moveUp(row.nodes, cursor);
      if (!handled && cursor.activeRowIndex > 0) {
        cursor.activeRowIndex--;
        cursor.astPath = [];
        cursor.characterOffset = rows[cursor.activeRowIndex].nodes.length;
      }
      break;
    }

    case 'ArrowDown': {
      const handled = moveDown(row.nodes, cursor);
      if (!handled && cursor.activeRowIndex < rows.length - 1) {
        cursor.activeRowIndex++;
        cursor.astPath = [];
        cursor.characterOffset = rows[cursor.activeRowIndex].nodes.length;
      }
      break;
    }

    case 'Tab': {
      const handled = tabNext(row.nodes, cursor);
      if (!handled) {
        if (cursor.activeRowIndex < rows.length - 1) {
          cursor.activeRowIndex++;
          cursor.astPath = [];
          cursor.characterOffset = 0;
        }
      }
      break;
    }

    case 'Backspace':
      deleteBackward(row.nodes, cursor, () => {
        deleteRow(cursor.activeRowIndex);
      });
      break;

    case 'Enter': {
      // If inside log base and base is empty, jump to argument
      if (cursor.astPath.length > 0) {
        const lastStep = cursor.astPath[cursor.astPath.length - 1];
        if (lastStep.slot === 'base') {
          const slot = getSlotNodes(row.nodes, cursor.astPath);
          if (slot.length === 0) {
            cursor.astPath[cursor.astPath.length - 1] = {
              nodeIndex: lastStep.nodeIndex,
              slot: 'argument',
            };
            cursor.characterOffset = 0;
            break;
          }
        }
      }
      evaluateCurrentRow();
      break;
    }

    case '/': {
      // Stacked fraction (never inline division)
      insertFraction(row.nodes, cursor);
      break;
    }

    case '^': {
      insertExponent(row.nodes, cursor);
      break;
    }

    case '(': {
      insertParenthesis(row.nodes, cursor, '(');
      break;
    }

    case ')': {
      insertParenthesis(row.nodes, cursor, ')');
      break;
    }

    case '!': {
      insertChar(row.nodes, cursor, '!');
      break;
    }

    default: {
      if (e.key.length === 1) {
        insertChar(row.nodes, cursor, e.key);
      } else {
        prevent = false;
      }
      break;
    }
  }

  if (prevent) {
    e.preventDefault();
    ensureInvariants();
    renderArithmetic();
  }
}

async function evaluateCurrentRow() {
  const row = rows[cursor.activeRowIndex];
  if (!row) return;

  const expressionStr = serializeToEngine(row.nodes);
  if (!expressionStr.trim()) {
    row.evaluation = { value: null, exact: null, error: 'Enter an expression' };
    renderArithmetic();
    return;
  }

  row.evaluating = true;
  renderArithmetic();

  try {
    row.evaluation = await invoke<Evaluation>('evaluate', { expression: expressionStr });
  } catch (err) {
    row.evaluation = {
      value: null,
      exact: null,
      error: err instanceof Error ? err.message : 'Evaluation failed',
    };
  } finally {
    row.evaluating = false;

    // After evaluating: if current row is at the bottom, ensure next blank row and move to it
    ensureInvariants();
    if (cursor.activeRowIndex < rows.length - 1) {
      cursor.activeRowIndex++;
      cursor.astPath = [];
      cursor.characterOffset = 0;
    }
    renderArithmetic();
  }
}

function deleteRow(index: number) {
  // Multi-Row Invariant: block/prevent row deletion if only 2 rows remain
  if (rows.length <= 2) return;

  rows.splice(index, 1);
  if (cursor.activeRowIndex >= rows.length) {
    cursor.activeRowIndex = rows.length - 1;
  } else if (cursor.activeRowIndex === index) {
    cursor.activeRowIndex = Math.max(0, index - 1);
  }
  cursor.astPath = [];
  cursor.characterOffset = 0;

  ensureInvariants();
  renderArithmetic();
}

function scrollStackToBottom() {
  const stack = page.querySelector<HTMLDivElement>('#expr-stack');
  if (stack) {
    requestAnimationFrame(() => {
      stack.scrollTop = stack.scrollHeight;
    });
  }
}

function isPlainNumber(str: string): boolean {
  return /^-?(?:\d+\.?\d*|\.\d+)$/.test(str);
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

// Navigation button handlers
for (const button of sectionButtons) {
  button.addEventListener('click', () => {
    const section = button.dataset.section;
    if (section && sections.includes(section as Section)) {
      renderPage(section as Section);
    }
  });
}

// Pre-evaluate the initial row
async function initInitialRow() {
  if (rows[0] && rows[0].nodes.length > 0) {
    try {
      const expr = serializeToEngine(rows[0].nodes);
      rows[0].evaluation = await invoke<Evaluation>('evaluate', { expression: expr });
      if (currentSection === 'Arithmetic') {
        renderArithmetic();
      }
    } catch {
      // Ignored during startup if engine not yet ready
    }
  }
}

initInitialRow();
renderPage('Home');
