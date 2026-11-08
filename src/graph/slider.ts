import type { Entry, GraphModel } from './graphModel.ts';
import { defaultRange, snap } from './state.ts';
import type { GraphRowView, SliderView } from './types.ts';

export interface SliderCallbacks {
  model: GraphModel;
  onValueChanged: () => void;
}

export function applyEntrySlider(view: GraphRowView, entry: Entry, callbacks: SliderCallbacks): void {
  const isSlider = entry.kind === 'variable' && entry.literal !== undefined && !entry.error;
  if (!isSlider) {
    view.slider?.box.remove();
    view.slider = undefined;
    return;
  }
  const value = entry.literal!;
  const range = view.row.range ?? defaultRange(value);
  range.min = Math.min(range.min, value);
  range.max = Math.max(range.max, value);
  view.row.range = range;
  const slider = view.slider ?? createSlider(view, callbacks);
  slider.name.textContent = entry.name!;
  setIfChanged(slider.input, 'min', String(range.min));
  setIfChanged(slider.input, 'max', String(range.max));
  setIfChanged(slider.input, 'step', String(range.step));
  if (Number(slider.input.value) !== value) slider.input.value = String(value);
  for (const [input, current] of [[slider.min, range.min], [slider.max, range.max], [slider.step, range.step]] as const) {
    if (document.activeElement !== input && Number(input.value) !== current) input.value = String(current);
  }
}

function createSlider(view: GraphRowView, callbacks: SliderCallbacks): SliderView {
  const box = document.createElement('div');
  box.className = 'graph-slider-box';
  box.innerHTML = `<input class="graph-slider" type="range" aria-label="Slider value"><div class="graph-slider-scope"><input type="number" aria-label="Slider minimum"><span>≤ <span class="graph-slider-name"></span> ≤</span><input type="number" aria-label="Slider maximum"><span>Step</span><input type="number" min="0" aria-label="Slider step"></div>`;
  const [input, min, max, step] = Array.from(box.querySelectorAll<HTMLInputElement>('input'));
  const slider: SliderView = { box, input, min, max, step, name: box.querySelector<HTMLSpanElement>('.graph-slider-name')! };
  view.root.insertBefore(box, view.error);
  view.slider = slider;
  input.addEventListener('input', () => setSliderValue(view, Number(input.value), callbacks));
  const applyScope = () => {
    const next = { min: Number(min.value), max: Number(max.value), step: Number(step.value) };
    const valid = [next.min, next.max, next.step].every(Number.isFinite) && next.min < next.max && next.step > 0;
    for (const field of [min, max, step]) field.classList.toggle('invalid', !valid);
    if (!valid || !view.row.range) return;
    view.row.range = next;
    const entry = callbacks.model.entries.find((item) => item.id === view.row.id);
    setSliderValue(view, entry?.literal ?? next.min, callbacks);
  };
  for (const field of [min, max, step]) field.addEventListener('change', applyScope);
  return slider;
}

function setSliderValue(view: GraphRowView, raw: number, callbacks: SliderCallbacks): void {
  const range = view.row.range;
  const equals = view.row.latex.indexOf('=');
  if (!range || equals < 0) return;
  const latex = `${view.row.latex.slice(0, equals)}=${snap(raw, range)}`;
  if (latex !== view.row.latex) {
    view.row.latex = latex;
    view.field.setValue(latex, { silenceNotifications: true });
  }
  callbacks.onValueChanged();
}

function setIfChanged(input: HTMLInputElement, attribute: 'min' | 'max' | 'step', value: string): void {
  if (input[attribute] !== value) input[attribute] = value;
}
