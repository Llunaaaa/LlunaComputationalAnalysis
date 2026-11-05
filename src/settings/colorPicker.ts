import { GRAPH_PALETTE } from './settingsDefaults.ts';

export interface SettingsColorPicker {
  open(anchor: HTMLElement, color: string): void;
  destroy(): void;
}

export function createSettingsColorPicker(onColor: (color: string) => void): SettingsColorPicker {
  const menu = document.createElement('div');
  menu.className = 'graph-color-menu settings-color-picker';
  menu.hidden = true;
  menu.innerHTML = '<div class="graph-color-tabs"><span>Color</span></div><div class="graph-color-grid"></div><label class="graph-color-hex">Hex <input type="text" inputmode="text" autocomplete="off" spellcheck="false"></label>';
  document.body.appendChild(menu);
  const grid = menu.querySelector<HTMLDivElement>('.graph-color-grid')!;
  const hex = menu.querySelector<HTMLInputElement>('input')!;

  for (const color of GRAPH_PALETTE) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'graph-color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    swatch.setAttribute('aria-label', `Set color ${color}`);
    grid.appendChild(swatch);
  }

  const setColor = (color: string): void => {
    hex.value = color;
    onColor(color);
  };
  const onGridClick = (event: Event): void => {
    const color = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]')?.dataset.color;
    if (color) setColor(color);
  };
  const onHexInput = (): void => {
    const normalized = hex.value.trim().replace(/^#/, '');
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
      hex.classList.remove('invalid');
      setColor(`#${normalized}`);
    } else {
      hex.classList.add('invalid');
    }
  };
  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (menu.hidden || (event.target as Node).isConnected && menu.contains(event.target as Node)) return;
    menu.hidden = true;
  };
  grid.addEventListener('click', onGridClick);
  hex.addEventListener('input', onHexInput);
  document.addEventListener('pointerdown', onDocumentPointerDown);

  return {
    open(anchor, color) {
      hex.value = color;
      hex.classList.remove('invalid');
      const bounds = anchor.getBoundingClientRect();
      menu.hidden = false;
      menu.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 250))}px`;
      menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 250))}px`;
    },
    destroy() {
      grid.removeEventListener('click', onGridClick);
      hex.removeEventListener('input', onHexInput);
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      menu.remove();
    },
  };
}
