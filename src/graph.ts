// Graph section UI. State lives at module level so the expression list and the
// viewport survive navigating to other sections; the DOM is rebuilt per visit
// and torn down by the returned cleanup function.

import { createMathfield, type MathfieldElement } from './mathfield.ts';
import { GraphModel, type Entry } from './graphModel.ts';
import {
  defaultViewport, formatTick, generateTicks, graphToScreen, panViewport, sampleCurve,
  screenToGraph, tickStep, zoomAroundCursor, type Viewport,
} from './plot.ts';
import type { Program } from './expression.ts';

/** Decimal places shown for slider values unless the step needs more. */
export const SLIDER_DECIMAL_PLACES = 2;
const DEFAULT_SLIDER_SPAN = 10;
const COLORS = ['#a7e635', '#5898ff', '#f28c8c', '#d2a8ff', '#f5c46b', '#72e0c0'];
const BUTTON_ZOOM = 1.5;
/** Interactive frames costlier than this coarsen the sample step. */
const FRAME_BUDGET_MS = 10;
const SETTLE_DELAY_MS = 140;

interface SliderRange { min: number; max: number; step: number }

interface Row {
  id: number;
  latex: string;
  color: string;
  visible: boolean;
  range?: SliderRange;
}

interface CurveCache { program: Program; key: string; segments: number[][] }

const state = {
  rows: [] as Row[],
  view: defaultViewport(),
  showGrid: true,
  showAxes: true,
  nextId: 1,
  nextColor: 0,
};
const model = new GraphModel();

function newRow(latex = ''): Row {
  return { id: state.nextId++, latex, color: COLORS[state.nextColor++ % COLORS.length], visible: true };
}

/** Invariant: the list always ends with exactly one blank row ready for input. */
function ensureTrailingBlank(): boolean {
  const last = state.rows[state.rows.length - 1];
  if (last && !last.latex.trim()) return false;
  state.rows.push(newRow());
  return true;
}

function decimalsFor(step: number): number {
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Number(exponent[1]);
  const dot = text.indexOf('.');
  return Math.max(SLIDER_DECIMAL_PLACES, dot < 0 ? 0 : text.length - dot - 1);
}

function defaultRange(value: number): SliderRange {
  return {
    min: value < 0 ? value : -DEFAULT_SLIDER_SPAN,
    max: value > 0 ? value : DEFAULT_SLIDER_SPAN,
    step: 10 ** -SLIDER_DECIMAL_PLACES,
  };
}

function snap(value: number, range: SliderRange): number {
  const snapped = range.min + Math.round((value - range.min) / range.step) * range.step;
  const clamped = Math.min(range.max, Math.max(range.min, snapped));
  return Number(clamped.toFixed(decimalsFor(range.step)));
}

function unusedVariableName(): string {
  const taken = new Set(model.names);
  for (const name of 'abcdfghjkmnpqrstuvw') if (!taken.has(name)) return name;
  let index = 1;
  while (taken.has(`a_${index}`)) index += 1;
  return `a_${index}`;
}

interface RowView {
  row: Row;
  root: HTMLDivElement;
  field: MathfieldElement;
  visibility: HTMLButtonElement;
  error: HTMLSpanElement;
  slider?: { box: HTMLDivElement; input: HTMLInputElement; min: HTMLInputElement; max: HTMLInputElement; step: HTMLInputElement; name: HTMLSpanElement };
}

export function renderGraph(container: HTMLElement): () => void {
  if (state.rows.length === 0) ensureTrailingBlank();

  container.innerHTML = `
    <div class="graph-workspace">
      <aside class="graph-expressions" aria-label="Graph expressions">
        <div class="graph-panel-heading"><span>Expressions</span><span class="graph-add-wrap"><button class="graph-add" type="button" aria-label="Add expression (right-click for more)" title="Add expression (right-click for more)">+</button><span class="graph-add-menu" role="menu" hidden><button type="button" role="menuitem" data-add-kind="function">Function</button><button type="button" role="menuitem" data-add-kind="slider">Slider</button><button type="button" role="menuitem" disabled title="Coming soon">Table</button></span></span></div>
        <div class="graph-expression-list"></div>
      </aside>
      <section class="graph-stage">
        <div class="graph-toolbar">
          <button type="button" data-action="fullscreen" aria-label="Toggle fullscreen graph" title="Toggle fullscreen graph">⛶</button>
          <button type="button" data-action="reset" title="Reset view">Reset view</button>
          <button type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
          <label><input type="checkbox" data-option="grid"> Grid</label>
          <label><input type="checkbox" data-option="axes"> Axes</label>
        </div>
        <div class="graph-canvas-wrap"><canvas aria-label="Interactive graph plot"></canvas><div class="graph-help">Scroll or pinch to zoom · drag to pan</div></div>
      </section>
    </div>`;

  const workspace = container.querySelector<HTMLDivElement>('.graph-workspace')!;
  const list = container.querySelector<HTMLDivElement>('.graph-expression-list')!;
  const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
  const canvasWrap = container.querySelector<HTMLDivElement>('.graph-canvas-wrap')!;
  const addButton = container.querySelector<HTMLButtonElement>('.graph-add')!;
  const addMenu = container.querySelector<HTMLElement>('.graph-add-menu')!;
  const gridToggle = container.querySelector<HTMLInputElement>('[data-option="grid"]')!;
  const axesToggle = container.querySelector<HTMLInputElement>('[data-option="axes"]')!;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  gridToggle.checked = state.showGrid;
  axesToggle.checked = state.showAxes;

  const views = new Map<number, RowView>();
  const curves = new Map<number, CurveCache>();
  let width = 0;
  let height = 0;
  let frame = 0;
  let settleTimer = 0;
  let interacting = false;
  let lastDrawMs = 0;

  // ---- model synchronisation -------------------------------------------------

  function sync(): void {
    model.update(state.rows);
    for (const entry of model.entries) {
      const view = views.get(entry.id);
      if (view) applyEntry(view, entry);
    }
    scheduleDraw();
  }

  function applyEntry(view: RowView, entry: Entry): void {
    const message = entry.kind === 'blank' ? '' : entry.error ?? '';
    if (view.error.textContent !== message) view.error.textContent = message;
    view.root.classList.toggle('has-error', message !== '');

    const isSlider = entry.kind === 'variable' && entry.literal !== undefined && !entry.error;
    if (!isSlider) {
      if (view.slider) {
        view.slider.box.remove();
        view.slider = undefined;
      }
      return;
    }
    const value = entry.literal!;
    const range = view.row.range ?? defaultRange(value);
    range.min = Math.min(range.min, value);
    range.max = Math.max(range.max, value);
    view.row.range = range;
    const slider = view.slider ?? buildSlider(view);
    slider.name.textContent = entry.name!;
    setIfChanged(slider.input, 'min', String(range.min));
    setIfChanged(slider.input, 'max', String(range.max));
    setIfChanged(slider.input, 'step', String(range.step));
    if (Number(slider.input.value) !== value) slider.input.value = String(value);
    for (const [input, current] of [[slider.min, range.min], [slider.max, range.max], [slider.step, range.step]] as const) {
      if (document.activeElement !== input && Number(input.value) !== current) input.value = String(current);
    }
  }

  function setIfChanged(input: HTMLInputElement, attribute: 'min' | 'max' | 'step', value: string): void {
    if (input[attribute] !== value) input[attribute] = value;
  }

  // ---- row DOM ------------------------------------------------------------------

  function buildSlider(view: RowView): NonNullable<RowView['slider']> {
    const box = document.createElement('div');
    box.className = 'graph-slider-box';
    box.innerHTML = `<input class="graph-slider" type="range" aria-label="Slider value"><div class="graph-slider-scope"><input type="number" aria-label="Slider minimum"><span>≤ <span class="graph-slider-name"></span> ≤</span><input type="number" aria-label="Slider maximum"><span>Step</span><input type="number" min="0" aria-label="Slider step"></div>`;
    const [input, min, max, step] = Array.from(box.querySelectorAll<HTMLInputElement>('input'));
    const slider = { box, input, min, max, step, name: box.querySelector<HTMLSpanElement>('.graph-slider-name')! };
    view.root.insertBefore(box, view.error);
    view.slider = slider;

    input.addEventListener('input', () => setSliderValue(view, Number(input.value)));
    const applyScope = () => {
      const next = { min: Number(min.value), max: Number(max.value), step: Number(step.value) };
      const valid = [next.min, next.max, next.step].every(Number.isFinite) && next.min < next.max && next.step > 0;
      for (const field of [min, max, step]) field.classList.toggle('invalid', !valid);
      if (!valid || !view.row.range) return;
      view.row.range = next;
      const entry = model.entries.find((item) => item.id === view.row.id);
      setSliderValue(view, entry?.literal ?? next.min);
    };
    for (const field of [min, max, step]) field.addEventListener('change', applyScope);
    return slider;
  }

  function setSliderValue(view: RowView, raw: number): void {
    const range = view.row.range;
    const equals = view.row.latex.indexOf('=');
    if (!range || equals < 0) return;
    const latex = `${view.row.latex.slice(0, equals)}=${snap(raw, range)}`;
    if (latex !== view.row.latex) {
      view.row.latex = latex;
      view.field.setValue(latex, { silenceNotifications: true });
    }
    sync();
  }

  function createRowView(row: Row): RowView {
    const root = document.createElement('div');
    root.className = 'graph-expression-row';
    root.style.setProperty('--row-color', row.color);

    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'graph-visibility';

    const field = createMathfield('graph-expression-input', 'Graph expression', row.latex);
    field.setAttribute('placeholder', 'y = f(x)');

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
    const view: RowView = { row, root, field, visibility, error };
    paintVisibility(view);

    visibility.addEventListener('click', () => {
      row.visible = !row.visible;
      paintVisibility(view);
      scheduleDraw();
    });
    remove.addEventListener('click', () => removeRow(row.id, false));
    field.addEventListener('input', () => {
      row.latex = field.value;
      if (ensureTrailingBlank()) appendRowView(state.rows[state.rows.length - 1]);
      sync();
    });
    field.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        focusRelative(row.id, 1);
      }
    });
    // Capture phase runs before MathLive edits, so this sees whether the row
    // was already empty (rather than emptied by this very keystroke).
    field.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || row.latex || state.rows[state.rows.length - 1] === row) return;
      event.preventDefault();
      event.stopPropagation();
      removeRow(row.id, true);
    }, { capture: true });
    field.addEventListener('move-out', (event: Event) => {
      const direction = (event as CustomEvent<{ direction: string }>).detail?.direction;
      if (direction === 'upward') focusRelative(row.id, -1);
      else if (direction === 'downward') focusRelative(row.id, 1);
    });
    views.set(row.id, view);
    return view;
  }

  function paintVisibility(view: RowView): void {
    const { row, visibility, root } = view;
    visibility.classList.toggle('hidden-curve', !row.visible);
    const label = row.visible ? 'Hide expression' : 'Show expression';
    visibility.title = label;
    visibility.setAttribute('aria-label', label);
    root.classList.toggle('curve-hidden', !row.visible);
  }

  function appendRowView(row: Row): RowView {
    const view = createRowView(row);
    list.appendChild(view.root);
    return view;
  }

  function insertRowBeforeTrailing(row: Row): RowView {
    const trailing = state.rows[state.rows.length - 1];
    state.rows.splice(state.rows.length - 1, 0, row);
    const view = createRowView(row);
    list.insertBefore(view.root, views.get(trailing.id)?.root ?? null);
    return view;
  }

  function removeRow(id: number, focusPrevious: boolean): void {
    const index = state.rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    state.rows.splice(index, 1);
    views.get(id)?.root.remove();
    views.delete(id);
    curves.delete(id);
    if (ensureTrailingBlank()) appendRowView(state.rows[state.rows.length - 1]);
    const target = state.rows[focusPrevious ? Math.max(0, index - 1) : Math.min(index, state.rows.length - 1)];
    if (target) focusRow(target.id, focusPrevious);
    sync();
  }

  function focusRow(id: number, atEnd = false): void {
    const view = views.get(id);
    if (!view) return;
    view.field.focus();
    if (atEnd) view.field.position = view.field.lastOffset;
    view.root.scrollIntoView({ block: 'nearest' });
  }

  function focusRelative(id: number, delta: number): void {
    const index = state.rows.findIndex((row) => row.id === id);
    const target = state.rows[index + delta];
    if (target) focusRow(target.id);
  }

  // ---- add button & menu ----------------------------------------------------------

  function closeMenu(): void { addMenu.hidden = true; }
  function focusTrailing(): void { focusRow(state.rows[state.rows.length - 1].id); }

  addButton.addEventListener('click', () => { closeMenu(); focusTrailing(); });
  addButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    addMenu.hidden = !addMenu.hidden;
  });
  addMenu.addEventListener('click', (event) => {
    const kind = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add-kind]')?.dataset.addKind;
    if (!kind) return;
    closeMenu();
    if (kind === 'slider') {
      const view = insertRowBeforeTrailing(newRow(`${unusedVariableName()}=1`));
      sync();
      focusRow(view.row.id, true);
    } else {
      focusTrailing();
    }
  });
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!addMenu.hidden && !(event.target as Element).closest('.graph-add-wrap')) closeMenu();
  };
  const onDocumentKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeyDown);

  // ---- drawing ------------------------------------------------------------------

  function scheduleDraw(): void {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  /** Marks the view as moving; a full-quality frame follows once it settles. */
  function interact(): void {
    interacting = true;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => { interacting = false; scheduleDraw(); }, SETTLE_DELAY_MS);
    scheduleDraw();
  }

  function draw(): void {
    frame = 0;
    if (width === 0 || height === 0) return;
    const started = performance.now();
    const view = state.view;
    ctx.fillStyle = '#090b09';
    ctx.fillRect(0, 0, width, height);
    drawGrid(view);

    const step = interacting ? Math.min(4, Math.max(1, Math.ceil(lastDrawMs / FRAME_BUDGET_MS))) : 1;
    const viewKey = `${view.centerX},${view.centerY},${view.unitsPerPixel},${width},${height},${step}`;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const entry of model.entries) {
      const row = views.get(entry.id)?.row;
      const program = entry.program;
      if (!row?.visible || !program || entry.error) continue;
      if (entry.kind === 'curve') drawCurve(entry.id, program, row.color, view, viewKey, step);
      else if (entry.kind === 'vertical') drawVertical(program, row.color, view);
    }
    for (const id of curves.keys()) if (!views.has(id)) curves.delete(id);
    lastDrawMs = performance.now() - started;
  }

  function drawCurve(id: number, program: Program, color: string, view: Viewport, viewKey: string, step: number): void {
    const key = `${viewKey}|${model.dependencyKey(program)}`;
    let cache = curves.get(id);
    if (!cache || cache.program !== program || cache.key !== key) {
      const env = model.environment(program);
      const f = (x: number) => { env[0] = x; return program.evaluate(env); };
      cache = { program, key, segments: sampleCurve(f, view, width, height, step) };
      curves.set(id, cache);
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const points of cache.segments) {
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    }
    ctx.stroke();
  }

  function drawVertical(program: Program, color: string, view: Viewport): void {
    const x = program.evaluate(model.environment(program));
    if (!Number.isFinite(x)) return;
    const sx = graphToScreen({ x, y: 0 }, width, height, view).x;
    if (sx < -2 || sx > width + 2) return;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  function drawGrid(view: Viewport): void {
    const step = tickStep(view.unitsPerPixel);
    const topLeft = screenToGraph(0, 0, width, height, view);
    const bottomRight = screenToGraph(width, height, width, height, view);
    const xTicks = generateTicks(topLeft.x, bottomRight.x, step);
    const yTicks = generateTicks(bottomRight.y, topLeft.y, step);
    const origin = graphToScreen({ x: 0, y: 0 }, width, height, view);
    if (state.showGrid) {
      ctx.strokeStyle = '#1c231c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of xTicks) {
        const sx = Math.round(graphToScreen({ x, y: 0 }, width, height, view).x) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
      }
      for (const y of yTicks) {
        const sy = Math.round(graphToScreen({ x: 0, y }, width, height, view).y) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(width, sy);
      }
      ctx.stroke();
    }
    if (!state.showAxes) return;
    ctx.strokeStyle = '#879187';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (origin.x >= 0 && origin.x <= width) { ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, height); }
    if (origin.y >= 0 && origin.y <= height) { ctx.moveTo(0, origin.y); ctx.lineTo(width, origin.y); }
    ctx.stroke();
    ctx.fillStyle = '#a8b0a7';
    ctx.font = '12px "Segoe UI", sans-serif';
    for (const x of xTicks) {
      const sx = graphToScreen({ x, y: 0 }, width, height, view).x;
      if (sx > 4 && sx < width - 25 && Math.abs(sx - origin.x) > 25) {
        ctx.fillText(formatTick(x), sx + 4, Math.min(height - 6, Math.max(14, origin.y + 16)));
      }
    }
    for (const y of yTicks) {
      const sy = graphToScreen({ x: 0, y }, width, height, view).y;
      if (sy > 14 && sy < height - 4 && Math.abs(sy - origin.y) > 16) {
        ctx.fillText(formatTick(y), Math.min(width - 42, Math.max(4, origin.x + 6)), sy - 4);
      }
    }
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    curves.clear();
    scheduleDraw();
  }

  // ---- viewport interaction -------------------------------------------------------

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;

  function zoomAt(cursor: { x: number; y: number }, factor: number, animate: boolean): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    state.view = zoomAroundCursor(state.view, cursor, width, height, factor);
    if (animate) interact(); else scheduleDraw();
  }

  canvas.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.toggle('dragging', pointers.size === 1);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.offsetX, y: event.offsetY };
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0 && distance > 0) zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pinchDistance / distance, true);
      pinchDistance = distance;
    } else {
      state.view = panViewport(state.view, point.x - previous.x, point.y - previous.y);
      interact();
    }
  });
  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvasWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * height : event.deltaY;
    // Touchpad pinch arrives as ctrl+wheel with small deltas; scale it up.
    const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
    zoomAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(pixels * sensitivity), true);
  }, { passive: false });

  const center = () => ({ x: width / 2, y: height / 2 });
  container.querySelector('[data-action="fullscreen"]')!.addEventListener('click', () => {
    if (document.fullscreenElement === workspace) void document.exitFullscreen();
    else void workspace.requestFullscreen();
  });
  container.querySelector('[data-action="reset"]')!.addEventListener('click', () => { state.view = defaultViewport(); scheduleDraw(); });
  container.querySelector('[data-action="zoom-in"]')!.addEventListener('click', () => zoomAt(center(), 1 / BUTTON_ZOOM, false));
  container.querySelector('[data-action="zoom-out"]')!.addEventListener('click', () => zoomAt(center(), BUTTON_ZOOM, false));
  gridToggle.addEventListener('change', () => { state.showGrid = gridToggle.checked; scheduleDraw(); });
  axesToggle.addEventListener('change', () => { state.showAxes = axesToggle.checked; scheduleDraw(); });

  // ---- mount ------------------------------------------------------------------------

  for (const row of state.rows) appendRowView(row);
  sync();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  return () => {
    resizeObserver.disconnect();
    cancelAnimationFrame(frame);
    window.clearTimeout(settleTimer);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
    if (document.fullscreenElement === workspace) void document.exitFullscreen();
    views.clear();
    curves.clear();
  };
}
