// Graph section composition root.
//
// Responsibilities are deliberately narrow:
// - rows.ts owns expression-row DOM and editing;
// - reorder.ts owns click-versus-drag ordering;
// - slider.ts owns slider controls;
// - colorMenu.ts owns both color-menu entry points;
// - canvas.ts owns all drawing and viewport resources.

import { GraphModel } from './graphModel.ts';
import { GraphCanvasController } from './graph/canvas.ts';
import { GraphColorMenu } from './graph/colorMenu.ts';
import { GRAPH_MARKUP } from './graph/markup.ts';
import { GraphRowController } from './graph/rows.ts';
import { ensureTrailingBlank, state, unusedVariableName } from './graph/state.ts';

export { SLIDER_DECIMAL_PLACES } from './graph/state.ts';

export function renderGraph(container: HTMLElement): () => void {
  if (state.rows.length === 0) ensureTrailingBlank();
  container.innerHTML = GRAPH_MARKUP;

  const workspace = container.querySelector<HTMLDivElement>('.graph-workspace')!;
  const list = container.querySelector<HTMLDivElement>('.graph-expression-list')!;
  const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
  const canvasWrap = container.querySelector<HTMLDivElement>('.graph-canvas-wrap')!;
  const addButton = container.querySelector<HTMLButtonElement>('.graph-add')!;
  const addMenu = container.querySelector<HTMLElement>('.graph-add-menu')!;
  const colorMenuElement = container.querySelector<HTMLDivElement>('.graph-color-menu')!;
  const colorGrid = container.querySelector<HTMLDivElement>('.graph-color-grid')!;
  const colorHex = container.querySelector<HTMLInputElement>('.graph-color-hex input')!;
  const gridToggle = container.querySelector<HTMLInputElement>('[data-option="grid"]')!;
  const axesToggle = container.querySelector<HTMLInputElement>('[data-option="axes"]')!;
  const model = new GraphModel();
  let canvasController: GraphCanvasController;

  const colorMenu = new GraphColorMenu(colorMenuElement, colorGrid, colorHex, (target, hex) => {
    target.row.color = hex;
    target.root.style.setProperty('--row-color', hex);
    canvasController.invalidateCurve(target.row.id);
  });
  const rows = new GraphRowController({
    list,
    colorMenu,
    model,
    invalidate: () => canvasController.invalidate(),
  });
  canvasController = new GraphCanvasController({
    canvas,
    canvasWrap,
    workspace,
    gridToggle,
    axesToggle,
    state,
    model,
    getRow: (id) => state.rows.find((row) => row.id === id),
  });

  function closeMenus(): void {
    addMenu.hidden = true;
    colorMenu.close();
  }

  function insertSlider(): void {
    rows.insertSlider(unusedVariableName(model.names));
  }

  addButton.addEventListener('click', () => {
    closeMenus();
    rows.focus(state.rows[state.rows.length - 1].id);
  });
  addButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    addMenu.hidden = !addMenu.hidden;
  });
  addMenu.addEventListener('click', (event) => {
    const kind = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add-kind]')?.dataset.addKind;
    if (!kind) return;
    addMenu.hidden = true;
    if (kind === 'slider') insertSlider();
    else rows.focus(state.rows[state.rows.length - 1].id);
  });

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!(event.target as Element).closest('.graph-add-wrap, .graph-color-menu')) closeMenus();
  };
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeMenus();
  };
  const onWindowPointerEnd = (event: PointerEvent) => {
    rows.handleGlobalPointerEnd(event);
    canvasController.handleGlobalPointerEnd(event);
  };
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeyDown);
  window.addEventListener('pointerup', onWindowPointerEnd);
  window.addEventListener('pointercancel', onWindowPointerEnd);

  rows.mount();
  canvasController.mount();
  rows.sync();

  return () => {
    colorMenu.cleanup();
    rows.cleanup();
    canvasController.cleanup();
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
    window.removeEventListener('pointerup', onWindowPointerEnd);
    window.removeEventListener('pointercancel', onWindowPointerEnd);
  };
}
