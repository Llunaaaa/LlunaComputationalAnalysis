import type { Row } from './types.ts';

export function fractionAvailable(row: Row): boolean {
  return Boolean(row.evaluation?.exact?.includes('/') && !row.evaluation.error);
}

export function paintFractionToggle(row: Row, button: HTMLButtonElement): void {
  const available = fractionAvailable(row);
  const active = available && row.showFraction;
  button.disabled = !available;
  button.title = available ? 'Toggle fraction / decimal' : 'Fraction unavailable for this result';
  button.classList.toggle('active', active);
  button.style.opacity = available ? '1' : '0.45';
  button.style.cursor = available ? 'pointer' : 'not-allowed';
  button.style.background = active
    ? '#5898ff'
    : button.matches(':hover') && available
      ? 'hsla(0, 0%, 70%, 0.3)'
      : 'transparent';
  button.style.color = active ? '#0b0d0b' : '#5898ff';
}

export function createFractionToggle(row: Row, repaint: () => void): HTMLButtonElement {
  // This button lives inside MathLive's shadow root, so its appearance is inline.
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fraction-toggle-btn';
  button.setAttribute('aria-label', 'Toggle fraction / decimal');
  button.innerHTML = '<span style="pointer-events:none">a/b</span>';
  Object.assign(button.style, {
    boxSizing: 'border-box', position: 'relative', top: '2px', alignSelf: 'center',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', padding: '0', marginRight: '4px',
    borderRadius: '8px', border: '1px solid transparent', lineHeight: '1',
    userSelect: 'none', touchAction: 'manipulation', fill: 'currentColor',
    transition: 'background 0.2s cubic-bezier(0.64, 0.09, 0.08, 1), color 0.2s ease',
  });
  const repaintHover = () => repaint();
  button.addEventListener('pointerenter', repaintHover);
  button.addEventListener('pointerleave', repaintHover);
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    row.showFraction = !row.showFraction;
    repaint();
  });
  return button;
}
