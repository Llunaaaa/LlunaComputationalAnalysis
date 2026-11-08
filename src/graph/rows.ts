import { createMathfield } from '../general/mathfield.ts';
import { GraphModel, type Entry } from './graphModel.ts';
import { GraphColorMenu } from './colorMenu.ts';
import { applyEntrySlider } from './slider.ts';
import { ExpressionReorderController } from './reorder.ts';
import { ensureTrailingBlank, newRow, state, type GraphRow } from './state.ts';
import type { GraphRowView } from './types.ts';

export interface RowControllerOptions {
  list: HTMLDivElement;
  colorMenu: GraphColorMenu;
  model: GraphModel;
  invalidate: () => void;
}

/** Owns expression-row DOM, editing, sliders, and row-level model updates. */
export class GraphRowController {
  private readonly list: HTMLDivElement;
  private readonly colorMenu: GraphColorMenu;
  private readonly model: GraphModel;
  private readonly invalidate: () => void;
  private readonly views = new Map<number, GraphRowView>();
  private readonly reorder: ExpressionReorderController;

  constructor(options: RowControllerOptions) {
    this.list = options.list;
    this.colorMenu = options.colorMenu;
    this.model = options.model;
    this.invalidate = options.invalidate;
    this.reorder = new ExpressionReorderController({
      state,
      list: this.list,
      getView: (id) => this.views.get(id),
      onChanged: () => this.sync(),
    });
  }

  mount(): void {
    for (const row of state.rows) this.append(row);
  }

  sync(): void {
    this.model.update(state.rows);
    for (const entry of this.model.entries) {
      const view = this.views.get(entry.id);
      if (!view) continue;
      this.applyEntry(view, entry);
    }
    this.invalidate();
  }

  append(row: GraphRow): GraphRowView {
    const view = this.create(row);
    this.list.appendChild(view.root);
    return view;
  }

  insertSlider(name: string): GraphRowView {
    const trailing = state.rows[state.rows.length - 1];
    const row = newRow(`${name}=1`);
    state.rows.splice(state.rows.length - 1, 0, row);
    const view = this.create(row);
    this.list.insertBefore(view.root, this.views.get(trailing.id)?.root ?? null);
    this.sync();
    this.focus(row.id, true);
    return view;
  }

  remove(id: number, focusPrevious: boolean): void {
    const index = state.rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    state.rows.splice(index, 1);
    this.views.get(id)?.root.remove();
    this.views.delete(id);
    if (ensureTrailingBlank()) this.append(state.rows[state.rows.length - 1]);
    const target = state.rows[focusPrevious ? Math.max(0, index - 1) : Math.min(index, state.rows.length - 1)];
    if (target) this.focus(target.id, focusPrevious);
    this.sync();
  }

  focus(id: number, atEnd = false): void {
    const view = this.views.get(id);
    if (!view) return;
    view.field.focus();
    if (atEnd) view.field.position = view.field.lastOffset;
    view.root.scrollIntoView({ block: 'nearest' });
  }

  focusRelative(id: number, delta: number): void {
    const index = state.rows.findIndex((row) => row.id === id);
    const target = state.rows[index + delta];
    if (target) this.focus(target.id);
  }

  handleGlobalPointerEnd(event: PointerEvent): void {
    this.reorder.handleGlobalPointerEnd(event);
  }

  cleanup(): void {
    this.reorder.cleanup();
    this.views.clear();
  }

  private create(row: GraphRow): GraphRowView {
    const root = document.createElement('div');
    root.className = 'graph-expression-row';
    root.style.setProperty('--row-color', row.color);
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'graph-visibility';
    const field = createMathfield('graph-expression-input', 'Graph expression', row.latex);
    field.setAttribute('placeholder', 'y = x');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'graph-delete';
    remove.textContent = '×';
    remove.title = 'Delete expression';
    remove.setAttribute('aria-label', 'Delete expression');
    const error = document.createElement('span');
    error.className = 'graph-expression-error';
    error.setAttribute('role', 'alert');
    root.append(visibility, field, remove, error);
    const view: GraphRowView = { row, root, field, visibility, error };
    this.views.set(row.id, view);
    this.paintVisibility(view);

    visibility.addEventListener('click', () => {
      if (this.reorder.consumeClick()) return;
      row.visible = !row.visible;
      this.paintVisibility(view);
      this.invalidate();
    });
    visibility.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.colorMenu.open(view, event.clientX, event.clientY);
    });
    this.reorder.bind(view);
    this.colorMenu.installFieldMenu(field, view);
    field.addEventListener('input', () => {
      row.latex = field.value;
      if (ensureTrailingBlank()) this.append(state.rows[state.rows.length - 1]);
      this.sync();
    });
    field.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.focusRelative(row.id, 1);
      }
    });
    field.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || row.latex || state.rows[state.rows.length - 1] === row) return;
      event.preventDefault();
      event.stopPropagation();
      this.remove(row.id, true);
    }, { capture: true });
    field.addEventListener('move-out', (event: Event) => {
      const direction = (event as CustomEvent<{ direction: string }>).detail?.direction;
      if (direction === 'upward') this.focusRelative(row.id, -1);
      else if (direction === 'downward') this.focusRelative(row.id, 1);
    });
    remove.addEventListener('click', () => this.remove(row.id, false));
    return view;
  }

  private applyEntry(view: GraphRowView, entry: Entry): void {
    const message = entry.kind === 'blank' ? '' : entry.error ?? '';
    view.error.textContent = message;
    view.root.classList.toggle('has-error', message !== '');
    applyEntrySlider(view, entry, { model: this.model, onValueChanged: () => this.sync() });
  }

  private paintVisibility(view: GraphRowView): void {
    const label = view.row.visible ? 'Hide expression' : 'Show expression';
    view.visibility.classList.toggle('hidden-curve', !view.row.visible);
    view.visibility.title = label;
    view.visibility.setAttribute('aria-label', label);
    view.root.classList.toggle('curve-hidden', !view.row.visible);
  }
}
