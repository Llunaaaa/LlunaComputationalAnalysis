import { defaultViewport, type Viewport } from './plot.ts';
import { getSettings } from '../settings/ui/settingsState.ts';

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export interface GraphRow {
  id: number;
  latex: string;
  color: string;
  visible: boolean;
  range?: SliderRange;
}

export const SLIDER_DECIMAL_PLACES = 2;
export const DEFAULT_SLIDER_SPAN = 10;
export const BUTTON_ZOOM = 1.5;

/** Palette order is stable so a row keeps its color across DOM rebuilds. */
export const COLORS = [...getSettings().ui.palette];

export interface GraphState {
  rows: GraphRow[];
  view: Viewport;
  showGrid: boolean;
  showAxes: boolean;
  nextId: number;
  nextColor: number;
}

export const state: GraphState = {
  rows: [],
  view: defaultViewport(),
  showGrid: getSettings().graphing.showGrid,
  showAxes: getSettings().graphing.showAxes,
  nextId: 1,
  nextColor: 0,
};

export function newRow(latex = ''): GraphRow {
  const palette = getSettings().ui.palette;
  return {
    id: state.nextId++,
    latex,
    color: palette[state.nextColor++ % palette.length],
    visible: true,
  };
}

/** The graph always keeps one editable blank row at the end. */
export function ensureTrailingBlank(): boolean {
  const last = state.rows[state.rows.length - 1];
  if (last && !last.latex.trim()) return false;
  state.rows.push(newRow());
  return true;
}

export function unusedVariableName(names: readonly string[]): string {
  const taken = new Set(names);
  for (const name of 'abcdfghjkmnpqrstuvw') if (!taken.has(name)) return name;
  let index = 1;
  while (taken.has(`a_${index}`)) index += 1;
  return `a_${index}`;
}

export function decimalsFor(step: number): number {
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Number(exponent[1]);
  const dot = text.indexOf('.');
  return Math.max(SLIDER_DECIMAL_PLACES, dot < 0 ? 0 : text.length - dot - 1);
}

export function defaultRange(value: number): SliderRange {
  return {
    min: value < 0 ? value : -DEFAULT_SLIDER_SPAN,
    max: value > 0 ? value : DEFAULT_SLIDER_SPAN,
    step: 10 ** -SLIDER_DECIMAL_PLACES,
  };
}

export function snap(value: number, range: SliderRange): number {
  const snapped = range.min + Math.round((value - range.min) / range.step) * range.step;
  const clamped = Math.min(range.max, Math.max(range.min, snapped));
  return Number(clamped.toFixed(decimalsFor(range.step)));
}
