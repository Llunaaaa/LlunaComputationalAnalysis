import { createRowView, type RowView } from './rows.ts';
import { paintFractionToggle } from './fractionToggle.ts';
import {
  MIN_ROWS,
  enforceInvariants,
  evaluateRow,
  rows,
  setPainter,
  startInitialEvaluation,
} from './state.ts';
import type { Row } from './types.ts';

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

  function paintResult(row: Row): void {
    const view = views.get(row.id);
    if (!view) return;
    paintFractionToggle(row, view.fraction);
    const el = view.result;
    const evaluation = row.evaluation;
    el.classList.toggle('has-error', Boolean(evaluation?.error) && !row.evaluating);
    if (row.evaluating) {
      el.textContent = 'Evaluating…';
    } else if (evaluation?.error) {
      el.textContent = `Error: ${evaluation.error}`;
    } else if (evaluation) {
      const fraction = row.showFraction && !view.fraction.disabled;
      const text = fraction
        ? evaluation.exact
        : evaluation.display_value || evaluation.exact || (evaluation.value === null ? '' : String(evaluation.value));
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
    for (const row of enforceInvariants()) {
      stack.appendChild(createRowView(row, views, actions).root);
    }
    renumber();
  }

  function focusRow(index: number): void {
    const view = rows[index] && views.get(rows[index].id);
    if (view) requestAnimationFrame(() => view.field.focus());
  }

  function scrollToBottom(): void {
    requestAnimationFrame(() => { stack.scrollTop = stack.scrollHeight; });
  }

  const actions = {
    appendMissingRows,
    focusRow,
    scrollToBottom,
    paintResult,
    evaluateRow,
  };

  for (const row of rows) stack.appendChild(createRowView(row, views, actions).root);
  renumber();
  page.querySelector('.add-expression-btn')!.addEventListener('click', () => {
    focusRow(rows.length - 1);
    scrollToBottom();
  });
  scrollToBottom();

  const detachPainter = setPainter(paintResult);
  startInitialEvaluation();
  return () => {
    detachPainter();
    views.clear();
  };
}
