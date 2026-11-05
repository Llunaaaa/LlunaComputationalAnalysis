import type { GraphState } from './state.ts';
import type { GraphRowView } from './types.ts';

export interface ReorderOptions {
  state: GraphState;
  list: HTMLDivElement;
  getView: (id: number) => GraphRowView | undefined;
  onChanged: () => void;
}

interface DragState {
  pointerId: number;
  rowId: number;
  startY: number;
  dragging: boolean;
  suppressClick: boolean;
  dropBeforeId: number;
}

const EMPTY: DragState = {
  pointerId: -1,
  rowId: -1,
  startY: 0,
  dragging: false,
  suppressClick: false,
  dropBeforeId: -1,
};

/** Isolates the dot's click-versus-drag state machine from row rendering. */
export class ExpressionReorderController {
  private readonly state: GraphState;
  private readonly list: HTMLDivElement;
  private readonly getView: ReorderOptions['getView'];
  private readonly onChanged: () => void;
  private drag: DragState = { ...EMPTY };

  constructor(options: ReorderOptions) {
    this.state = options.state;
    this.list = options.list;
    this.getView = options.getView;
    this.onChanged = options.onChanged;
  }

  bind(view: GraphRowView): void {
    view.visibility.addEventListener('pointerdown', (event) => this.start(view, event));
    view.visibility.addEventListener('pointermove', (event) => this.move(view, event));
    view.visibility.addEventListener('pointerup', this.finish);
    view.visibility.addEventListener('pointercancel', this.finish);
  }

  finish = (event: PointerEvent): void => {
    if (event.pointerId !== this.drag.pointerId) return;
    const view = this.getView(this.drag.rowId);
    if (this.drag.dragging) this.commit();
    if (event.type === 'pointercancel') this.drag.suppressClick = false;
    this.clearDropTarget();
    view?.root.classList.remove('drag-ghost');
    this.list.classList.remove('reordering');
    if (view?.visibility.hasPointerCapture(event.pointerId)) view.visibility.releasePointerCapture(event.pointerId);
    this.drag = { ...EMPTY };
  };

  handleGlobalPointerEnd(event: PointerEvent): void {
    this.finish(event);
  }

  consumeClick(): boolean {
    if (!this.drag.suppressClick) return false;
    this.drag.suppressClick = false;
    return true;
  }

  cleanup(): void {
    this.clearDropTarget();
    this.drag = { ...EMPTY };
  }

  private start(view: GraphRowView, event: PointerEvent): void {
    if (event.button !== 0 || !view.row.latex.trim()) return;
    event.preventDefault();
    this.drag = {
      pointerId: event.pointerId,
      rowId: view.row.id,
      startY: event.clientY,
      dragging: false,
      suppressClick: false,
      dropBeforeId: -1,
    };
    view.visibility.setPointerCapture(event.pointerId);
  }

  private move(view: GraphRowView, event: PointerEvent): void {
    if (event.pointerId !== this.drag.pointerId) return;
    if (!this.drag.dragging && Math.abs(event.clientY - this.drag.startY) < 5) return;
    if (!this.drag.dragging) {
      this.drag.dragging = true;
      this.drag.suppressClick = true;
      view.root.classList.add('drag-ghost');
      this.list.classList.add('reordering');
    }
    event.preventDefault();
    this.updateDropTarget(event.clientY);
  }

  private updateDropTarget(clientY: number): void {
    this.clearDropTarget();
    const dragged = this.getView(this.drag.rowId);
    if (!dragged) return;
    const candidates = this.state.rows.slice(0, -1)
      .filter((row) => row.id !== this.drag.rowId)
      .map((row) => this.getView(row.id))
      .filter((view): view is GraphRowView => Boolean(view));
    const target = candidates.find((candidate) => {
      const bounds = candidate.root.getBoundingClientRect();
      return clientY < bounds.top + bounds.height / 2;
    });
    this.drag.dropBeforeId = target?.row.id ?? -1;
    this.list.style.setProperty('--drop-color', dragged.row.color);
    target?.root.classList.add('drop-before');
    const reference = target?.root ?? this.getView(this.state.rows[this.state.rows.length - 1].id)?.root;
    if (reference) this.list.insertBefore(dragged.root, reference);
  }

  private clearDropTarget(): void {
    for (const row of this.state.rows) this.getView(row.id)?.root.classList.remove('drop-before');
    this.list.style.removeProperty('--drop-color');
  }

  private commit(): void {
    const from = this.state.rows.findIndex((row) => row.id === this.drag.rowId);
    if (from < 0) return;
    const [row] = this.state.rows.splice(from, 1);
    const target = this.drag.dropBeforeId < 0
      ? this.state.rows.length - 1
      : this.state.rows.findIndex((candidate) => candidate.id === this.drag.dropBeforeId);
    this.state.rows.splice(Math.max(0, target < 0 ? this.state.rows.length - 1 : target), 0, row);
    const rowView = this.getView(row.id);
    const reference = this.drag.dropBeforeId < 0
      ? this.getView(this.state.rows[this.state.rows.length - 1].id)?.root
      : this.getView(this.drag.dropBeforeId)?.root;
    if (rowView && reference) this.list.insertBefore(rowView.root, reference);
    this.onChanged();
  }
}
