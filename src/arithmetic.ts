// Arithmetic section: numbered rows evaluated by the native engine.
// Row state is module-level so it survives navigating between sections.

import { invoke } from '@tauri-apps/api/core';
import { createMathfield, type MathfieldElement } from './mathfield.ts';
import { latexToEngine } from './latexConverter.ts';

interface Evaluation {
  value: number | null;
  exact: string | null;
  display_value: string | null;
  is_approximate: boolean;
  error: string | null;
}

interface Row {
  id: number;
  latex: string;
  evaluation: Evaluation | null;
  evaluating: boolean;
  showFraction: boolean;
  /** Incremented per edit/evaluation so stale engine responses are dropped. */
  request: number;
}

interface RowView {
  root: HTMLElement;
  field: MathfieldElement;
  number: HTMLSpanElement;
  fraction: HTMLButtonElement;
  remove: HTMLButtonElement;
  result: HTMLDivElement;
}

const MIN_ROWS = 2;
const ANS_PATTERN = /\\operatorname\{ans\}|\\mathrm\{ans\}|\bans\b/gi;
const EXACT_RATIONAL = /^-?\d+(?:\/\d+)?$/;

let nextId = 1;
const newRow = (latex = ''): Row => ({ id: nextId++, latex, evaluation: null, evaluating: false, showFraction: false, request: 0 });
const rows: Row[] = [newRow('3^{2-6}'), newRow()];
let initialEvaluationStarted = false;
/** Paints a row's result in the currently mounted view, if any. */
let paint: ((row: Row) => void) | null = null;

const errorResult = (error: string): Evaluation =>
  ({ value: null, exact: null, display_value: null, is_approximate: false, error });

const messageOf = (caught: unknown) =>
  caught instanceof Error ? caught.message : typeof caught === 'string' ? caught : 'Evaluation failed';

/** Minimum row count plus exactly one trailing blank row. Returns added rows. */
function enforceInvariants(): Row[] {
  const added: Row[] = [];
  while (rows.length < MIN_ROWS || rows[rows.length - 1].latex.trim()) {
    const row = newRow();
    rows.push(row);
    added.push(row);
  }
  return added;
}

/** Replaces `ans` with the closest previous result; exact when it is rational. */
function substituteAns(latex: string, index: number): string {
  ANS_PATTERN.lastIndex = 0;
  if (!ANS_PATTERN.test(latex)) return latex;
  for (let i = index - 1; i >= 0; i -= 1) {
    const evaluation = rows[i].evaluation;
    if (!evaluation || evaluation.error || evaluation.value === null) continue;
    const exact = evaluation.exact?.replace(/\s+/g, '');
    const text = exact && EXACT_RATIONAL.test(exact) && !evaluation.is_approximate ? exact : String(evaluation.value);
    return latex.replace(ANS_PATTERN, `(${text})`);
  }
  throw new Error("'ans' has no previous value");
}

async function evaluate(row: Row): Promise<void> {
  const request = ++row.request;
  row.evaluating = true;
  paint?.(row);
  let evaluation: Evaluation;
  try {
    const expression = latexToEngine(substituteAns(row.latex, rows.indexOf(row))).trim();
    evaluation = expression
      ? await invoke<Evaluation>('evaluate', { expression })
      : errorResult('Enter an expression');
  } catch (caught) {
    evaluation = errorResult(messageOf(caught));
  }
  if (request !== row.request) return;
  row.evaluation = evaluation;
  row.evaluating = false;
  paint?.(row);
}

export function renderArithmetic(page: HTMLElement): () => void {
  enforceInvariants();
  page.innerHTML = `
    <div class="arithmetic-container">
      <div class="arithmetic-toolbar">
        <span class="arithmetic-toolbar-title">Arithmetic Workspace</span>
        <button class="add-expression-btn" type="button"><span>+</span> Add expression</button>
      </div>
      <div class="expression-stack"></div>
    </div>`;
  const stack = page.querySelector<HTMLDivElement>('.expression-stack')!;
  const views = new Map<number, RowView>();

  function paintFraction(row: Row, view: RowView): void {
    const available = Boolean(row.evaluation?.exact?.includes('/') && !row.evaluation.error);
    const active = available && row.showFraction;
    const button = view.fraction;
    button.disabled = !available;
    button.title = available ? 'Toggle fraction / decimal' : 'Fraction unavailable for this result';
    button.classList.toggle('active', active);
    button.style.opacity = available ? '1' : '0.45';
    button.style.cursor = available ? 'pointer' : 'not-allowed';
    button.style.background = active ? '#5898ff' : button.matches(':hover') && available ? 'hsla(0, 0%, 70%, 0.3)' : 'transparent';
    button.style.color = active ? '#0b0d0b' : '#5898ff';
  }

  function paintResult(row: Row): void {
    const view = views.get(row.id);
    if (!view) return;
    paintFraction(row, view);
    const el = view.result;
    const evaluation = row.evaluation;
    el.classList.toggle('has-error', Boolean(evaluation?.error) && !row.evaluating);
    if (row.evaluating) {
      el.textContent = 'Evaluating…';
    } else if (evaluation?.error) {
      el.textContent = `Error: ${evaluation.error}`;
    } else if (evaluation) {
      const fraction = row.showFraction && !view.fraction.disabled;
      const text = fraction ? evaluation.exact : evaluation.display_value ?? (evaluation.value === null ? '' : String(evaluation.value));
      el.textContent = text ? `${!fraction && evaluation.is_approximate ? '≈' : '='} ${text}` : '';
    } else {
      el.textContent = '';
    }
  }

  function renumber(): void {
    rows.forEach((row, index) => {
      const view = views.get(row.id);
      if (!view) return;
      view.number.textContent = String(index + 1);
      view.field.setAttribute('aria-label', `Expression ${index + 1}`);
      view.remove.disabled = rows.length <= MIN_ROWS;
      view.remove.title = rows.length > MIN_ROWS ? 'Delete expression' : `Minimum ${MIN_ROWS} rows required`;
    });
  }

  function appendMissingRows(): void {
    for (const row of enforceInvariants()) stack.appendChild(createRowView(row).root);
    renumber();
  }

  function focusRow(index: number): void {
    const view = rows[index] && views.get(rows[index].id);
    if (view) requestAnimationFrame(() => view.field.focus());
  }

  function scrollToBottom(): void {
    requestAnimationFrame(() => { stack.scrollTop = stack.scrollHeight; });
  }

  function createFractionButton(row: Row): HTMLButtonElement {
    // Lives inside the mathfield's shadow root (next to MathLive's own toggles),
    // where page CSS does not reach, so its look is set inline.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fraction-toggle-btn';
    button.setAttribute('aria-label', 'Toggle fraction / decimal');
    button.innerHTML = '<span style="pointer-events:none">a/b</span>';
    Object.assign(button.style, {
      boxSizing: 'border-box', position: 'relative', top: '2px', alignSelf: 'center',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '34px', height: '34px', padding: '0', marginRight: '4px',
      borderRadius: '8px', border: '1px solid transparent', lineHeight: '1',
      userSelect: 'none', touchAction: 'manipulation', fill: 'currentColor',
      transition: 'background 0.2s cubic-bezier(0.64, 0.09, 0.08, 1), color 0.2s ease',
    });
    const repaint = () => { const view = views.get(row.id); if (view) paintFraction(row, view); };
    button.addEventListener('pointerenter', repaint);
    button.addEventListener('pointerleave', repaint);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.showFraction = !row.showFraction;
      paintResult(row);
    });
    return button;
  }

  function createRowView(row: Row): RowView {
    const root = document.createElement('article');
    root.className = 'expression-row';
    const main = document.createElement('div');
    main.className = 'expression-row-main';
    const number = document.createElement('span');
    number.className = 'row-number';
    const field = createMathfield('expression-mathfield', 'Expression', row.latex);
    const fraction = createFractionButton(row);
    field.addEventListener('mount', () => {
      field.shadowRoot?.querySelector('.ML__toggles')?.appendChild(fraction);
    }, { once: true });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'row-delete-btn';
    remove.textContent = '×';
    const result = document.createElement('div');
    result.className = 'expression-row-result';
    main.append(number, field, remove);
    root.append(main, result);
    const view: RowView = { root, field, number, fraction, remove, result };
    views.set(row.id, view);

    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      if (rows.length <= MIN_ROWS) return;
      rows.splice(rows.indexOf(row), 1);
      views.delete(row.id);
      root.remove();
      appendMissingRows();
    });
    field.addEventListener('input', () => {
      row.latex = field.value;
      row.request += 1;
      if (row.evaluation || row.evaluating) {
        row.evaluation = null;
        row.evaluating = false;
        paintResult(row);
      }
      appendMissingRows();
    });
    field.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      void evaluate(row);
      appendMissingRows();
      focusRow(rows.indexOf(row) + 1);
      scrollToBottom();
    });
    field.addEventListener('move-out', (event: Event) => {
      const direction = (event as CustomEvent<{ direction: string }>).detail?.direction;
      const index = rows.indexOf(row);
      if (direction === 'upward') focusRow(index - 1);
      else if (direction === 'downward') focusRow(index + 1);
    });
    paintResult(row);
    return view;
  }

  for (const row of rows) stack.appendChild(createRowView(row).root);
  renumber();
  page.querySelector('.add-expression-btn')!.addEventListener('click', () => {
    focusRow(rows.length - 1);
    scrollToBottom();
  });
  scrollToBottom();

  paint = paintResult;
  if (!initialEvaluationStarted) {
    initialEvaluationStarted = true;
    for (const row of rows) if (row.latex.trim()) void evaluate(row);
  }
  return () => {
    if (paint === paintResult) paint = null;
    views.clear();
  };
}
