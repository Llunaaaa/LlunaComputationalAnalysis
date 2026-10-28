import { invoke } from '@tauri-apps/api/core';
import { MathfieldElement } from 'mathlive';
import { latexToEngine } from './latexConverter';
import './styles.css';

// Ensure MathLive finds KaTeX fonts locally from the public directory
MathfieldElement.fontsDirectory = '/fonts/';

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
  display_value: string | null;
  is_approximate: boolean;
  error: string | null;
}

interface ExpressionRowData {
  id: number;
  latex: string;
  evaluation: Evaluation | null;
  evaluating: boolean;
  showExactFraction?: boolean;
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

// Multi-Row Invariant: Minimum 2 rows on screen at all times.
// Trailing Blank Invariant: Bottom row is always empty ready for user input.
const rows: ExpressionRowData[] = [
  { id: 1, latex: '3^{2-6}', evaluation: null, evaluating: false },
  { id: 2, latex: '', evaluation: null, evaluating: false },
];

function ensureInvariants() {
  while (rows.length < 2) {
    rows.push({ id: nextRowId++, latex: '', evaluation: null, evaluating: false });
  }
  const last = rows[rows.length - 1];
  if (last.latex.trim().length > 0) {
    rows.push({ id: nextRowId++, latex: '', evaluation: null, evaluating: false });
  }
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
    <div class="arithmetic-container">
      <div class="arithmetic-toolbar">
        <span class="arithmetic-toolbar-title">Arithmetic Workspace</span>
        <button class="add-expression-btn" type="button" id="add-expr-btn">
          <span>+</span> Add expression
        </button>
      </div>
      <div class="expression-stack" id="expr-stack"></div>
    </div>
  `;

  const stack = page.querySelector<HTMLDivElement>('#expr-stack');
  if (!stack) return;

  // Build rows in DOM
  rows.forEach((row, index) => {
    const rowEl = createRowElement(row, index);
    stack.appendChild(rowEl);
  });

  // Add expression button handler
  const addBtn = page.querySelector<HTMLButtonElement>('#add-expr-btn');
  addBtn?.addEventListener('click', () => {
    const newBlankRow: ExpressionRowData = {
      id: nextRowId++,
      latex: '',
      evaluation: null,
      evaluating: false,
    };
    rows.push(newBlankRow);
    const newRowEl = createRowElement(newBlankRow, rows.length - 1);
    stack.appendChild(newRowEl);
    syncRowNumbers();
    focusRow(newBlankRow.id);
    scrollStackToBottom();
  });

  scrollStackToBottom();
}

function ensureTrailingBlankRow() {
  const stack = page.querySelector<HTMLDivElement>('#expr-stack');
  if (!stack) return;

  while (rows.length < 2) {
    const newRow: ExpressionRowData = {
      id: nextRowId++,
      latex: '',
      evaluation: null,
      evaluating: false,
    };
    rows.push(newRow);
    stack.appendChild(createRowElement(newRow, rows.length - 1));
  }

  const last = rows[rows.length - 1];
  if (last.latex.trim().length > 0) {
    const newBlankRow: ExpressionRowData = {
      id: nextRowId++,
      latex: '',
      evaluation: null,
      evaluating: false,
    };
    rows.push(newBlankRow);
    stack.appendChild(createRowElement(newBlankRow, rows.length - 1));
  }

  syncRowNumbers();
}

function createRowElement(row: ExpressionRowData, index: number): HTMLElement {
  const article = document.createElement('article');
  article.className = 'expression-row';
  article.dataset.rowId = String(row.id);

  const mainDiv = document.createElement('div');
  mainDiv.className = 'expression-row-main';

  // Row number
  const numSpan = document.createElement('span');
  numSpan.className = 'row-number';
  numSpan.textContent = String(index + 1);
  mainDiv.appendChild(numSpan);

  // Mathfield element
  const mf = new MathfieldElement();
  mf.className = 'expression-mathfield';
  mf.value = row.latex;
  mf.mathVirtualKeyboardPolicy = 'manual';
  mf.smartFence = false;
  mf.setAttribute('aria-label', `Expression ${index + 1}`);

  mf.addEventListener('mount', () => {
    try {
      mf.inlineShortcuts = {
        ...mf.inlineShortcuts,
        root: '\\sqrt[#?]{#?}',
        nthroot: '\\sqrt[#?]{#?}',
      };
    } catch {
      // Ignore if already configured
    }
  });

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'row-delete-btn';
  delBtn.type = 'button';
  delBtn.textContent = '×';
  delBtn.title = rows.length > 2 ? 'Delete expression' : 'Minimum 2 rows required';
  delBtn.disabled = rows.length <= 2;

  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteRow(row.id);
  });

  mainDiv.appendChild(mf);

  // Fraction toggle button [a/b] positioned to the right of math-field (which ends with the 3 blue lines)
  const fracBtn = document.createElement('button');
  fracBtn.className = 'fraction-toggle-btn';
  fracBtn.type = 'button';
  fracBtn.textContent = 'a/b';
  fracBtn.title = 'Toggle exact fraction / decimal';
  fracBtn.style.display = 'none';

  fracBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    row.showExactFraction = !row.showExactFraction;
    updateResultElement(resultDiv, row);
  });
  mainDiv.appendChild(fracBtn);

  mainDiv.appendChild(delBtn);
  article.appendChild(mainDiv);

  // Result display
  const resultDiv = document.createElement('div');
  resultDiv.className = 'expression-row-result';
  updateResultElement(resultDiv, row);
  article.appendChild(resultDiv);

  // Event handlers for Mathfield
  mf.addEventListener('input', () => {
    row.latex = mf.value;
    if (row.evaluation) {
      row.evaluation = null;
      updateResultElement(resultDiv, row);
    }
    ensureTrailingBlankRow();
  });

  mf.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await evaluateRow(row, resultDiv);

      ensureTrailingBlankRow();

      // Move focus down to next row if available
      const currentRowIdx = rows.findIndex((r) => r.id === row.id);
      if (currentRowIdx >= 0 && currentRowIdx < rows.length - 1) {
        focusRow(rows[currentRowIdx + 1].id);
      }
      scrollStackToBottom();
    }
  });

  // Vertical arrow key navigation across rows
  mf.addEventListener('move-out', (e: Event) => {
    const customEvent = e as CustomEvent<{ direction: 'upward' | 'downward' | 'forward' | 'backward' }>;
    const dir = customEvent.detail?.direction;
    const currentRowIdx = rows.findIndex((r) => r.id === row.id);

    if (dir === 'upward' && currentRowIdx > 0) {
      focusRow(rows[currentRowIdx - 1].id);
    } else if (dir === 'downward' && currentRowIdx < rows.length - 1) {
      focusRow(rows[currentRowIdx + 1].id);
    }
  });

  return article;
}

function updateResultElement(el: HTMLElement, row: ExpressionRowData) {
  const article = el.closest('.expression-row');
  const fracBtn = article?.querySelector<HTMLButtonElement>('.fraction-toggle-btn');

  const hasExactFraction = Boolean(
    row.evaluation &&
    row.evaluation.exact &&
    row.evaluation.exact.includes('/') &&
    !row.evaluation.is_approximate
  );

  if (fracBtn) {
    fracBtn.style.display = hasExactFraction ? 'inline-flex' : 'none';
    fracBtn.classList.toggle('active', Boolean(row.showExactFraction));
  }

  if (row.evaluating) {
    el.textContent = 'Evaluating…';
    el.className = 'expression-row-result';
    return;
  }

  if (row.evaluation?.error) {
    el.innerHTML = `<span class="has-error">Error: ${escapeHtml(row.evaluation.error)}</span>`;
    el.className = 'expression-row-result has-error';
    return;
  }

  if (row.evaluation) {
    let formattedVal = row.evaluation.display_value ??
      (row.evaluation.value !== null && row.evaluation.value !== undefined
        ? (Number.isInteger(row.evaluation.value) ? String(row.evaluation.value) : String(row.evaluation.value))
        : '');

    if (hasExactFraction && row.showExactFraction) {
      formattedVal = row.evaluation.exact!;
    }

    if (formattedVal) {
      const symbol = row.evaluation.is_approximate ? '≈' : '=';
      el.textContent = `${symbol} ${formattedVal}`;
      el.className = 'expression-row-result';
      return;
    }
  }

  el.textContent = '';
  el.className = 'expression-row-result';
}

async function evaluateRow(row: ExpressionRowData, resultEl: HTMLElement) {
  let latexInput = row.latex;

  // Substitute "ans" with the preceding evaluated result
  if (/(?:\\operatorname\{ans\}|\bans\b)/i.test(latexInput)) {
    const currentRowIdx = rows.findIndex((r) => r.id === row.id);
    let prevVal: string | null = null;
    for (let i = currentRowIdx - 1; i >= 0; i--) {
      if (rows[i].evaluation && rows[i].evaluation?.value !== null && rows[i].evaluation?.value !== undefined) {
        prevVal = String(rows[i].evaluation!.value);
        break;
      }
    }
    if (prevVal !== null) {
      latexInput = latexInput.replace(/(?:\\operatorname\{ans\}|\bans\b)/gi, `(${prevVal})`);
    } else {
      row.evaluation = {
        value: null,
        exact: null,
        display_value: null,
        is_approximate: false,
        error: "'ans' has no previous value",
      };
      updateResultElement(resultEl, row);
      return;
    }
  }

  const engineExpr = latexToEngine(latexInput);
  if (!engineExpr.trim()) {
    row.evaluation = { value: null, exact: null, display_value: null, is_approximate: false, error: 'Enter an expression' };
    updateResultElement(resultEl, row);
    return;
  }

  row.evaluating = true;
  updateResultElement(resultEl, row);

  try {
    row.evaluation = await invoke<Evaluation>('evaluate', { expression: engineExpr });
  } catch (err) {
    row.evaluation = {
      value: null,
      exact: null,
      display_value: null,
      is_approximate: false,
      error: err instanceof Error ? err.message : 'Evaluation failed',
    };
  } finally {
    row.evaluating = false;
    updateResultElement(resultEl, row);
  }
}

function deleteRow(rowId: number) {
  // Deletion rule: Block deletion if only 2 rows remain
  if (rows.length <= 2) return;

  const index = rows.findIndex((r) => r.id === rowId);
  if (index === -1) return;

  rows.splice(index, 1);

  // Remove element from DOM
  const rowEl = page.querySelector<HTMLElement>(`.expression-row[data-row-id="${rowId}"]`);
  rowEl?.remove();

  ensureTrailingBlankRow();
  syncRowNumbers();
}

function syncRowNumbers() {
  const stack = page.querySelector<HTMLDivElement>('#expr-stack');
  if (!stack) return;

  const rowEls = stack.querySelectorAll<HTMLElement>('.expression-row');
  rowEls.forEach((el, index) => {
    const numEl = el.querySelector<HTMLElement>('.row-number');
    if (numEl) numEl.textContent = String(index + 1);

    const delBtn = el.querySelector<HTMLButtonElement>('.row-delete-btn');
    if (delBtn) {
      delBtn.disabled = rows.length <= 2;
      delBtn.title = rows.length > 2 ? 'Delete expression' : 'Minimum 2 rows required';
    }
  });
}

function focusRow(rowId: number) {
  const rowEl = page.querySelector<HTMLElement>(`.expression-row[data-row-id="${rowId}"]`);
  const mf = rowEl?.querySelector<MathfieldElement>('.expression-mathfield');
  if (mf) {
    requestAnimationFrame(() => {
      mf.focus();
    });
  }
}

function scrollStackToBottom() {
  const stack = page.querySelector<HTMLDivElement>('#expr-stack');
  if (stack) {
    requestAnimationFrame(() => {
      stack.scrollTop = stack.scrollHeight;
    });
  }
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

// Pre-evaluate the initial row on launch
async function initInitialRow() {
  if (rows[0] && rows[0].latex.trim()) {
    try {
      const expr = latexToEngine(rows[0].latex);
      rows[0].evaluation = await invoke<Evaluation>('evaluate', { expression: expr });
      if (currentSection === 'Arithmetic') {
        const rowEl = page.querySelector<HTMLElement>(`.expression-row[data-row-id="${rows[0].id}"]`);
        const resEl = rowEl?.querySelector<HTMLElement>('.expression-row-result');
        if (resEl) updateResultElement(resEl, rows[0]);
      }
    } catch {
      // Ignored during startup
    }
  }
}

initInitialRow();
renderPage('Home');
