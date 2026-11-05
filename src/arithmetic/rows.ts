import { createMathfield, type MathfieldElement } from '../mathfield.ts';
import { createFractionToggle } from './fractionToggle.ts';
import { MIN_ROWS, removeRow, updateRow } from './state.ts';
import type { Row } from './types.ts';

export interface RowView {
  root: HTMLElement;
  field: MathfieldElement;
  number: HTMLSpanElement;
  fraction: HTMLButtonElement;
  remove: HTMLButtonElement;
  result: HTMLDivElement;
}

export interface RowViewActions {
  appendMissingRows(): void;
  focusRow(index: number): void;
  scrollToBottom(): void;
  paintResult(row: Row): void;
  evaluateRow(row: Row): void;
}

export function createRowView(
  row: Row,
  views: Map<number, RowView>,
  actions: RowViewActions,
): RowView {
  const root = document.createElement('article');
  root.className = 'expression-row';
  const main = document.createElement('div');
  main.className = 'expression-row-main';
  const number = document.createElement('span');
  number.className = 'row-number';
  const field = createMathfield('expression-mathfield', 'Expression', row.latex);
  const fraction = createFractionToggle(row, () => actions.paintResult(row));
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
    if (views.size <= MIN_ROWS) return;
    removeRow(row);
    views.delete(row.id);
    root.remove();
    actions.appendMissingRows();
  });
  field.addEventListener('input', () => {
    updateRow(row, field.value);
    actions.appendMissingRows();
  });
  field.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    actions.appendMissingRows();
    actions.focusRow(actionsIndex(row, views) + 1);
    actions.scrollToBottom();
    // MathLive may emit its final input event after keydown. Evaluate on the
    // next task so the request token and LaTeX represent the settled row.
    window.setTimeout(() => {
      if (row.latex.trim()) void actions.evaluateRow(row);
    }, 0);
  });
  field.addEventListener('move-out', (event: Event) => {
    const direction = (event as CustomEvent<{ direction: string }>).detail?.direction;
    const index = actionsIndex(row, views) - 1;
    if (direction === 'upward') actions.focusRow(index);
    else if (direction === 'downward') actions.focusRow(index + 2);
  });
  actions.paintResult(row);
  return view;
}

function actionsIndex(row: Row, views: Map<number, RowView>): number {
  const view = views.get(row.id);
  if (!view) return -1;
  return Array.from(views.values()).indexOf(view);
}
