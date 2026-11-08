// Shared MathLive setup so every section's input behaves identically.
import { MathfieldElement } from 'mathlive';

MathfieldElement.fontsDirectory = '/fonts/';
// No keypress sounds: avoids decoding/holding audio buffers for every field.
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;

const SHORTCUTS = {
  root: '\\sqrt[#?]{#?}',
  nthroot: '\\sqrt[#?]{#?}',
  sum: '\\sum_{#?}^{#?} #?',
  prod: '\\prod_{#?}^{#?} #?',
  int: '\\int_{#?}^{#?} #?\\, dx',
  integral: '\\int_{#?}^{#?} #?\\, dx',
  diff: '\\frac{d}{dx} #?',
  lim: '\\lim_{x \\to #?} #?',
  sin: '\\sin(#?)',
  cos: '\\cos(#?)',
  tan: '\\tan(#?)',
};

export function createMathfield(className: string, label: string, latex = ''): MathfieldElement {
  const field = new MathfieldElement();
  field.className = className;
  field.value = latex;
  field.mathVirtualKeyboardPolicy = 'manual';
  field.smartFence = false;
  field.setAttribute('aria-label', label);
  field.addEventListener('mount', () => {
    field.inlineShortcuts = { ...field.inlineShortcuts, ...SHORTCUTS };
  }, { once: true });
  return field;
}

export type { MathfieldElement };
