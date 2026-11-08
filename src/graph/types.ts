import type { MathfieldElement } from '../general/mathfield.ts';
import type { GraphRow } from './state.ts';

export interface SliderView {
  box: HTMLDivElement;
  input: HTMLInputElement;
  min: HTMLInputElement;
  max: HTMLInputElement;
  step: HTMLInputElement;
  name: HTMLSpanElement;
}

export interface GraphRowView {
  row: GraphRow;
  root: HTMLDivElement;
  field: MathfieldElement;
  visibility: HTMLButtonElement;
  error: HTMLSpanElement;
  slider?: SliderView;
}
