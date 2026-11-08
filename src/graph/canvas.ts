import { GraphModel } from './graphModel.ts';
import {
  defaultViewport, formatTick, generateTicks, graphToScreen, panViewport, sampleCurve,
  screenToGraph, tickStep, zoomAroundCursor, type Viewport,
} from './plot.ts';
import type { Program } from '../general/expression/index.ts';
import { subscribeFullscreen, toggleFullscreen } from '../general/fullscreen.ts';
import { getSettings } from '../settings/ui/settingsState.ts';
import type { GraphRow, GraphState } from './state.ts';

const BUTTON_ZOOM = 1.5;
const FRAME_BUDGET_MS = 10;
const SETTLE_DELAY_MS = 140;

interface CurveCache {
  program: Program;
  key: string;
  segments: number[][];
}

export interface CanvasControllerOptions {
  canvas: HTMLCanvasElement;
  canvasWrap: HTMLDivElement;
  workspace: HTMLDivElement;
  gridToggle: HTMLInputElement;
  axesToggle: HTMLInputElement;
  state: GraphState;
  model: GraphModel;
  getRow: (id: number) => GraphRow | undefined;
}

/** Owns all canvas resources and interaction state. No row DOM is touched here. */
export class GraphCanvasController {
  private readonly canvas: HTMLCanvasElement;
  private readonly canvasWrap: HTMLDivElement;
  private readonly workspace: HTMLDivElement;
  private readonly gridToggle: HTMLInputElement;
  private readonly axesToggle: HTMLInputElement;
  private readonly state: GraphState;
  private readonly model: GraphModel;
  private readonly getRow: (id: number) => GraphRow | undefined;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly curves = new Map<number, CurveCache>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private width = 0;
  private height = 0;
  private frame = 0;
  private settleTimer = 0;
  private interacting = false;
  private lastDrawMs = 0;
  private pinchDistance = 0;
  private readonly fullscreenButton: HTMLButtonElement | null;
  private unsubscribeFullscreen: (() => void) | null = null;

  constructor(options: CanvasControllerOptions) {
    this.canvas = options.canvas;
    this.canvasWrap = options.canvasWrap;
    this.workspace = options.workspace;
    this.gridToggle = options.gridToggle;
    this.axesToggle = options.axesToggle;
    this.state = options.state;
    this.model = options.model;
    this.getRow = options.getRow;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.fullscreenButton = this.workspace.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
    this.gridToggle.checked = this.state.showGrid;
    this.axesToggle.checked = this.state.showAxes;
  }

  mount(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerEnd);
    this.canvas.addEventListener('pointercancel', this.onPointerEnd);
    this.canvasWrap.addEventListener('wheel', this.onWheel, { passive: false });
    this.gridToggle.addEventListener('change', this.onGridChange);
    this.axesToggle.addEventListener('change', this.onAxesChange);
    this.fullscreenButton?.addEventListener('click', this.toggleFullscreen);
    this.unsubscribeFullscreen = subscribeFullscreen(this.updateFullscreenButton);
    this.workspace.querySelector('[data-action="reset"]')?.addEventListener('click', this.reset);
    this.workspace.querySelector('[data-action="zoom-in"]')?.addEventListener('click', this.zoomIn);
    this.workspace.querySelector('[data-action="zoom-out"]')?.addEventListener('click', this.zoomOut);
    this.resizeObserver.observe(this.canvas);
  }

  invalidate(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  invalidateCurve(id: number): void {
    this.curves.delete(id);
    this.invalidate();
  }

  handleGlobalPointerEnd = (event: PointerEvent): void => {
    this.onPointerEnd(event);
  };

  cleanup(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    this.canvasWrap.removeEventListener('wheel', this.onWheel);
    this.gridToggle.removeEventListener('change', this.onGridChange);
    this.axesToggle.removeEventListener('change', this.onAxesChange);
    window.clearTimeout(this.settleTimer);
    cancelAnimationFrame(this.frame);
    this.fullscreenButton?.removeEventListener('click', this.toggleFullscreen);
    this.unsubscribeFullscreen?.();
    this.unsubscribeFullscreen = null;
    this.pointers.clear();
    this.curves.clear();
  }

  private readonly resizeObserver = new ResizeObserver(() => {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.round(this.width * ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.curves.clear();
    this.invalidate();
  });

  private readonly interact = (): void => {
    this.interacting = true;
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.interacting = false;
      this.invalidate();
    }, SETTLE_DELAY_MS);
    this.invalidate();
  };

  private readonly draw = (): void => {
    this.frame = 0;
    if (this.width === 0 || this.height === 0) return;
    const started = performance.now();
    const view = this.state.view;
    this.ctx.fillStyle = '#090b09';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid(view);

    const step = this.interacting ? Math.min(4, Math.max(1, Math.ceil(this.lastDrawMs / FRAME_BUDGET_MS))) : 1;
    const viewKey = `${view.centerX},${view.centerY},${view.unitsPerPixel},${this.width},${this.height},${step}`;
    this.ctx.lineWidth = getSettings().graphing.lineThickness;
    this.ctx.lineJoin = 'round';
    for (let index = this.model.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.model.entries[index];
      const row = this.getRow(entry.id);
      if (!row?.visible || !entry.program || entry.error) continue;
      if (entry.kind === 'curve') this.drawCurve(entry.id, entry.program, row.color, view, viewKey, step);
      else if (entry.kind === 'vertical') this.drawVertical(entry.program, row.color, view);
    }
    for (const id of this.curves.keys()) if (!this.getRow(id)) this.curves.delete(id);
    this.lastDrawMs = performance.now() - started;
  };

  private drawCurve(id: number, program: Program, color: string, view: Viewport, viewKey: string, step: number): void {
    const key = `${viewKey}|${this.model.dependencyKey(program)}`;
    let cache = this.curves.get(id);
    if (!cache || cache.program !== program || cache.key !== key) {
      const env = this.model.environment(program);
      const f = (x: number) => {
        env[0] = x;
        return program.evaluate(env);
      };
      cache = { program, key, segments: sampleCurve(f, view, this.width, this.height, step) };
      this.curves.set(id, cache);
    }
    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    for (const points of cache.segments) {
      this.ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) this.ctx.lineTo(points[index], points[index + 1]);
    }
    this.ctx.stroke();
  }

  private drawVertical(program: Program, color: string, view: Viewport): void {
    const x = program.evaluate(this.model.environment(program));
    if (!Number.isFinite(x)) return;
    const sx = graphToScreen({ x, y: 0 }, this.width, this.height, view).x;
    if (sx < -2 || sx > this.width + 2) return;
    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(sx, 0);
    this.ctx.lineTo(sx, this.height);
    this.ctx.stroke();
  }

  private drawGrid(view: Viewport): void {
    const step = tickStep(view.unitsPerPixel);
    const topLeft = screenToGraph(0, 0, this.width, this.height, view);
    const bottomRight = screenToGraph(this.width, this.height, this.width, this.height, view);
    const xTicks = generateTicks(topLeft.x, bottomRight.x, step);
    const yTicks = generateTicks(bottomRight.y, topLeft.y, step);
    const origin = graphToScreen({ x: 0, y: 0 }, this.width, this.height, view);
    if (this.state.showGrid) {
      this.ctx.strokeStyle = '#1c231c';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (const x of xTicks) {
        const sx = Math.round(graphToScreen({ x, y: 0 }, this.width, this.height, view).x) + 0.5;
        this.ctx.moveTo(sx, 0); this.ctx.lineTo(sx, this.height);
      }
      for (const y of yTicks) {
        const sy = Math.round(graphToScreen({ x: 0, y }, this.width, this.height, view).y) + 0.5;
        this.ctx.moveTo(0, sy); this.ctx.lineTo(this.width, sy);
      }
      this.ctx.stroke();
    }
    if (!this.state.showAxes) return;
    this.ctx.strokeStyle = '#879187';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    if (origin.x >= 0 && origin.x <= this.width) { this.ctx.moveTo(origin.x, 0); this.ctx.lineTo(origin.x, this.height); }
    if (origin.y >= 0 && origin.y <= this.height) { this.ctx.moveTo(0, origin.y); this.ctx.lineTo(this.width, origin.y); }
    this.ctx.stroke();
    this.ctx.fillStyle = '#a8b0a7';
    this.ctx.font = '12px "Segoe UI", sans-serif';
    for (const x of xTicks) {
      const sx = graphToScreen({ x, y: 0 }, this.width, this.height, view).x;
      if (sx > 4 && sx < this.width - 25 && Math.abs(sx - origin.x) > 25) {
        this.ctx.fillText(formatTick(x), sx + 4, Math.min(this.height - 6, Math.max(14, origin.y + 16)));
      }
    }
    for (const y of yTicks) {
      const sy = graphToScreen({ x: 0, y }, this.width, this.height, view).y;
      if (sy > 14 && sy < this.height - 4 && Math.abs(sy - origin.y) > 16) {
        this.ctx.fillText(formatTick(y), Math.min(this.width - 42, Math.max(4, origin.x + 6)), sy - 4);
      }
    }
  }

  private zoomAt(cursor: { x: number; y: number }, factor: number, animate: boolean): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.state.view = zoomAroundCursor(this.state.view, cursor, this.width, this.height, factor);
    if (animate) this.interact(); else this.invalidate();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.toggle('dragging', this.pointers.size === 1);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.offsetX, y: event.offsetY };
    this.pointers.set(event.pointerId, point);
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance > 0 && distance > 0) {
        this.zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, this.pinchDistance / distance, true);
      }
      this.pinchDistance = distance;
    } else {
      this.state.view = panViewport(this.state.view, point.x - previous.x, point.y - previous.y);
      this.interact();
    }
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.pointers.size === 0) this.canvas.classList.remove('dragging');
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * this.height : event.deltaY;
    const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
    this.zoomAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(pixels * sensitivity), true);
  };

  private readonly toggleFullscreen = (): void => {
    toggleFullscreen();
  };

  private readonly updateFullscreenButton = (isFullscreen: boolean): void => {
    if (!this.fullscreenButton) return;
    this.fullscreenButton.setAttribute('aria-pressed', String(isFullscreen));
    this.fullscreenButton.title = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
    this.fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen graph' : 'Enter fullscreen graph');
  };

  private readonly reset = (): void => {
    this.state.view = defaultViewport();
    this.invalidate();
  };

  private readonly zoomIn = (): void => {
    this.zoomAt({ x: this.width / 2, y: this.height / 2 }, 1 / BUTTON_ZOOM, false);
  };

  private readonly zoomOut = (): void => {
    this.zoomAt({ x: this.width / 2, y: this.height / 2 }, BUTTON_ZOOM, false);
  };

  private readonly onGridChange = (): void => {
    this.state.showGrid = this.gridToggle.checked;
    this.invalidate();
  };

  private readonly onAxesChange = (): void => {
    this.state.showAxes = this.axesToggle.checked;
    this.invalidate();
  };
}
