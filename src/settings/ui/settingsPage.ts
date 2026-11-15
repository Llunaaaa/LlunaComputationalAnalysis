import { settingsStore } from './settingsState.ts';
import { SETTINGS_TABS, type SettingsTabId } from './settingsTabs.ts';
import { createSettingsColorPicker } from './colorPicker.ts';
import { unitsCatalogStore } from '../units/unitsState.ts';
import { renderUnitRows } from '../units/unitsView.ts';
import type { UnitDefinition } from '../units/unitsCatalog.ts';
import type { AppSettings } from './settingsTypes.ts';

function applyUI(settings: AppSettings): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.ui.accentColor);
  root.style.setProperty('--graph-input-lime', settings.graphing.expressionOutlineColor);
  root.dataset.density = settings.ui.density;
  root.dataset.fontScale = settings.ui.fontScale;
  root.classList.toggle('reduce-motion', settings.ui.reducedMotion);
}

export function renderSettings(container: HTMLElement): () => void {
  let activeTab: SettingsTabId = 'ui';
  let suppressRender = false;
  container.innerHTML = `<section class="settings-page" aria-labelledby="settings-title"><div class="settings-tabs" role="tablist" aria-label="Settings categories">${SETTINGS_TABS.map((tab) => `<button type="button" role="tab" data-settings-tab="${tab.id}" aria-controls="settings-tab-content">${tab.label}</button>`).join('')}</div><div id="settings-tab-content" class="settings-tab-content" role="tabpanel"></div></section>`;
  const content = container.querySelector<HTMLDivElement>('#settings-tab-content')!;
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const renderActive = (): void => {
    const settings = settingsStore.getSettings();
    const tab = SETTINGS_TABS.find((candidate) => candidate.id === activeTab)!;
    cleanupTabControls();
    content.innerHTML = tab.render(settings);
    for (const button of tabs) {
      const selected = button.dataset.settingsTab === activeTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    cleanupTabControls = bindTabControls();
  };
  let cleanupTabControls = (): void => {};
  const bindTabControls = (): (() => void) => {
    const cleanups: (() => void)[] = [];
    for (const button of tabs) button.onclick = () => { activeTab = button.dataset.settingsTab as SettingsTabId; renderActive(); };
    content.querySelector<HTMLSelectElement>('[data-setting="density"]')?.addEventListener('change', (event) => settingsStore.updateCategory('ui', { density: (event.target as HTMLSelectElement).value as AppSettings['ui']['density'] }));
    content.querySelector<HTMLSelectElement>('[data-setting="fontScale"]')?.addEventListener('change', (event) => settingsStore.updateCategory('ui', { fontScale: (event.target as HTMLSelectElement).value as AppSettings['ui']['fontScale'] }));
    content.querySelector<HTMLInputElement>('[data-setting="reducedMotion"]')?.addEventListener('change', (event) => settingsStore.updateCategory('ui', { reducedMotion: (event.target as HTMLInputElement).checked }));
    for (const radio of Array.from(content.querySelectorAll<HTMLInputElement>('[name="performance-mode"]'))) radio.addEventListener('change', () => settingsStore.updateCategory('performance', { mode: radio.value as AppSettings['performance']['mode'] }));
    for (const input of Array.from(content.querySelectorAll<HTMLInputElement>('[data-graph-setting]'))) input.addEventListener('change', () => {
      const key = input.dataset.graphSetting as keyof AppSettings['graphing'];
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
      settingsStore.updateCategory('graphing', { [key]: value });
    });
    const unitSearch = content.querySelector<HTMLInputElement>('[data-unit-search]');
    const unitCategory = content.querySelector<HTMLSelectElement>('[data-unit-category]');
    const unitKind = content.querySelector<HTMLSelectElement>('[data-unit-kind]');
    const unitEnabled = content.querySelector<HTMLSelectElement>('[data-unit-enabled]');
    const unitList = content.querySelector<HTMLTableSectionElement>('[data-unit-list="units"]');
    const prefixList = content.querySelector<HTMLTableSectionElement>('[data-unit-list="prefixes"]');
    const updateUnits = (): void => {
      const query = unitSearch?.value ?? '';
      const category = unitCategory?.value ?? 'all';
      const kind = unitKind?.value ?? 'all';
      const enabled = unitEnabled?.value ?? 'all';
      const matches = (unit: ReturnType<typeof unitsCatalogStore.getState>['units'][number]): boolean => {
        const haystack = `${unit.quantity} ${unit.name} ${unit.symbol} ${unit.id} ${unit.expression}`.toLowerCase();
        return (!query || haystack.includes(query.toLowerCase())) &&
          (category === 'all' || unit.category === category) &&
          (kind === 'all' || unit.kind === kind) &&
          (enabled === 'all' || enabled === (unit.enabled ? 'enabled' : 'disabled'));
      };
      const state = unitsCatalogStore.getState();
      if (unitList) unitList.innerHTML = renderUnitRows(state.units.filter((unit) => unit.kind !== 'prefix' && matches(unit)));
      if (prefixList) prefixList.innerHTML = renderUnitRows(state.units.filter((unit) => unit.kind === 'prefix' && matches(unit)));
    };
    unitSearch?.addEventListener('input', updateUnits);
    unitCategory?.addEventListener('change', updateUnits);
    unitKind?.addEventListener('change', updateUnits);
    unitEnabled?.addEventListener('change', updateUnits);
    const updateCategoryOptions = (): void => {
      const categories = unitsCatalogStore.getState().categories;
      for (const select of content.querySelectorAll<HTMLSelectElement>('[data-unit-category], [data-unit-edit-category]')) {
        const selected = select.value;
        const first = select.dataset.unitEditCategory === 'true' ? '' : '<option value="all">All categories</option>';
        select.innerHTML = `${first}${categories.map((category) => `<option value="${category}">${category}</option>`).join('')}`;
        if (categories.includes(selected)) select.value = selected;
      }
    };
    const unsubscribeUnits = unitsCatalogStore.subscribe(() => { updateCategoryOptions(); updateUnits(); });
    cleanups.push(unsubscribeUnits);
    const editor = content.querySelector<HTMLFormElement>('[data-unit-editor]');
    const error = content.querySelector<HTMLElement>('[data-unit-error]');
    const openEditor = (unit?: ReturnType<typeof unitsCatalogStore.getState>['units'][number]): void => {
      if (!editor) return;
      editor.hidden = false;
      editor.dataset.editing = unit?.id ?? '';
      (editor.querySelector<HTMLInputElement>('[data-unit-quantity]')!).value = unit?.quantity ?? '';
      (editor.querySelector<HTMLInputElement>('[data-unit-name]')!).value = unit?.name ?? '';
      (editor.querySelector<HTMLInputElement>('[data-unit-symbol]')!).value = unit?.symbol ?? '';
      (editor.querySelector<HTMLInputElement>('[data-unit-expression]')!).value = unit?.expression === 'null' ? '' : unit?.expression ?? '';
      (editor.querySelector<HTMLSelectElement>('[data-unit-edit-category]')!).value = unit?.category ?? unitsCatalogStore.getState().categories[0];
      (editor.querySelector<HTMLSelectElement>('[data-unit-edit-kind]')!).value = unit?.kind ?? 'derived';
      (editor.querySelector<HTMLInputElement>('[data-unit-edit-enabled]')!).checked = unit?.enabled ?? true;
    };
    content.querySelector<HTMLButtonElement>('[data-unit-add]')?.addEventListener('click', () => openEditor());
    content.querySelector<HTMLButtonElement>('[data-unit-add-category]')?.addEventListener('click', () => {
      const category = globalThis.prompt('New unit category name');
      if (!category) return;
      try { unitsCatalogStore.addCategory(category); } catch (caught) { if (error) error.textContent = caught instanceof Error ? caught.message : String(caught); }
    });
    content.querySelector<HTMLButtonElement>('[data-unit-cancel]')?.addEventListener('click', () => { if (editor) editor.hidden = true; });
    editor?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = {
        quantity: editor.querySelector<HTMLInputElement>('[data-unit-quantity]')!.value,
        name: editor.querySelector<HTMLInputElement>('[data-unit-name]')!.value,
        symbol: editor.querySelector<HTMLInputElement>('[data-unit-symbol]')!.value,
        expression: editor.querySelector<HTMLInputElement>('[data-unit-expression]')!.value,
        category: editor.querySelector<HTMLSelectElement>('[data-unit-edit-category]')!.value,
        kind: editor.querySelector<HTMLSelectElement>('[data-unit-edit-kind]')!.value as UnitDefinition['kind'],
        enabled: editor.querySelector<HTMLInputElement>('[data-unit-edit-enabled]')!.checked,
      };
      try {
        if (editor.dataset.editing) unitsCatalogStore.update(editor.dataset.editing, input);
        else unitsCatalogStore.create(input);
        editor.hidden = true;
        if (error) error.textContent = '';
      } catch (caught) { if (error) error.textContent = caught instanceof Error ? caught.message : String(caught); }
    });
    content.addEventListener('change', (event) => {
      const toggle = (event.target as HTMLElement).closest<HTMLInputElement>('[data-unit-toggle]');
      const row = toggle?.closest<HTMLTableRowElement>('[data-unit-id]');
      if (toggle && row) unitsCatalogStore.setEnabled(row.dataset.unitId!, toggle.checked);
    });
    content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLTableRowElement>('[data-unit-id]');
      if (!row) return;
      const unit = unitsCatalogStore.getState().units.find((candidate) => candidate.id === row.dataset.unitId);
      if (target.closest('[data-unit-edit]')) openEditor(unit);
      if (target.closest('[data-unit-reset]') && unit) unitsCatalogStore.reset(unit.id);
      if (target.closest('[data-unit-delete]') && unit && globalThis.confirm(`Delete ${unit.name}?`)) unitsCatalogStore.remove(unit.id);
    });
    for (const button of Array.from(content.querySelectorAll<HTMLButtonElement>('[data-settings-color]'))) {
      const key = button.dataset.settingsColor!;
      const picker = createSettingsColorPicker((color) => {
        suppressRender = true;
        if (key === 'accentColor') settingsStore.updateCategory('ui', { accentColor: color });
        else if (key === 'expressionOutlineColor') settingsStore.updateCategory('graphing', { expressionOutlineColor: color });
        else if (key.startsWith('palette-')) {
          const index = Number(key.slice('palette-'.length));
          const palette = settingsStore.getSettings().ui.palette;
          if (Number.isInteger(index) && index >= 0 && index < palette.length) {
            palette[index] = color;
            settingsStore.updateCategory('ui', { palette });
          }
        }
        button.style.setProperty('--settings-color', color);
        suppressRender = false;
      });
      button.addEventListener('click', () => picker.open(button, button.style.getPropertyValue('--settings-color')));
      cleanups.push(() => picker.destroy());
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    const index = tabs.findIndex((tab) => tab.dataset.settingsTab === activeTab);
    activeTab = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].dataset.settingsTab as SettingsTabId;
    renderActive();
    tabs.find((tab) => tab.dataset.settingsTab === activeTab)?.focus();
  };
  const unsubscribe = settingsStore.subscribe((settings) => { applyUI(settings); if (!suppressRender) renderActive(); });
  container.addEventListener('keydown', onKeyDown);
  applyUI(settingsStore.getSettings());
  renderActive();
  return () => { cleanupTabControls(); unsubscribe(); container.removeEventListener('keydown', onKeyDown); };
}
