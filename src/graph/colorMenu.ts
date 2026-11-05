import type { MathfieldElement } from '../mathfield.ts';
import { getSettings } from '../settings/settingsState.ts';
import type { GraphRowView } from './types.ts';

type ColorTarget = Pick<GraphRowView, 'row' | 'root'>;

export class GraphColorMenu {
  private readonly menu: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly hex: HTMLInputElement;
  private target: ColorTarget | null = null;
  private readonly onColor: (target: ColorTarget, hex: string) => void;

  constructor(menu: HTMLDivElement, grid: HTMLDivElement, hex: HTMLInputElement, onColor: GraphColorMenu['onColor']) {
    this.menu = menu;
    this.grid = grid;
    this.hex = hex;
    this.onColor = onColor;
    this.populate();
    this.grid.addEventListener('click', this.onGridClick);
    this.hex.addEventListener('input', this.onHexInput);
  }

  open(view: GraphRowView, clientX?: number, clientY?: number): void {
    const bounds = view.root.getBoundingClientRect();
    this.populate();
    this.target = view;
    this.hex.value = view.row.color;
    this.hex.classList.remove('invalid');
    this.menu.hidden = false;
    this.menu.style.left = `${Math.max(8, Math.min(clientX ?? bounds.right, window.innerWidth - 250))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(clientY ?? bounds.top, window.innerHeight - 250))}px`;
  }

  close(): void {
    this.menu.hidden = true;
    this.target = null;
  }

  installFieldMenu(field: MathfieldElement, view: GraphRowView): void {
    field.addEventListener('mount', () => {
      field.menuItems = field.menuItems.map((item) => {
        if (!('id' in item) || item.id !== 'color' || !('submenu' in item)) return item;
        return {
          ...item,
          submenu: [
            ...getSettings().ui.palette.map((color, index) => ({
              type: 'command' as const,
              id: `graph-color-${index}`,
              label: `<span class="graph-menu-swatch" style="background:${color}" aria-label="${color}"></span>`,
              onMenuSelect: () => this.set(view, color),
            })),
            {
              type: 'command' as const,
              id: 'graph-color-custom',
              label: 'Custom Hex…',
              onMenuSelect: () => this.open(view),
            },
          ],
          columnCount: 5,
          submenuClass: 'graph-color-submenu',
        };
      });
    }, { once: true });
  }

  cleanup(): void {
    this.grid.removeEventListener('click', this.onGridClick);
    this.hex.removeEventListener('input', this.onHexInput);
    this.close();
  }

  private populate(): void {
    const palette = getSettings().ui.palette;
    this.grid.replaceChildren();
    for (const color of palette) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'graph-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.setAttribute('aria-label', `Set color ${color}`);
      this.grid.appendChild(swatch);
    }
  }

  private set(target: ColorTarget, color: string): void {
    this.target = target;
    this.onColor(target, color);
  }

  private readonly onGridClick = (event: Event): void => {
    const color = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]')?.dataset.color;
    if (color && this.target) this.set(this.target, color);
    if (color) this.hex.value = color;
  };

  private readonly onHexInput = (): void => {
    if (!this.target) return;
    const normalized = this.hex.value.trim().replace(/^#/, '');
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
      this.hex.classList.add('invalid');
      return;
    }
    this.hex.classList.remove('invalid');
    this.set(this.target, `#${normalized}`);
  };
}
