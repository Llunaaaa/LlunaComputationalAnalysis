import { settingsStore } from './settingsState.ts';
import { SETTINGS_TABS, type SettingsTabId } from './settingsTabs.ts';
import { createSettingsColorPicker } from './colorPicker.ts';
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
