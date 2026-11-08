import { cloneDefaults, GRAPH_PALETTE } from './settingsDefaults.ts';
import { persistSettings, readStoredSettings } from './settingsPersistence.ts';
import type { AppSettings, SettingsCategory, SettingsListener } from './settingsTypes.ts';

const HEX_COLOR = /^#[\da-f]{6}$/i;
const PERFORMANCE_MODES = ['efficiency', 'standard', 'performance'] as const;
const SAMPLING_QUALITIES = ['low', 'standard', 'high'] as const;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mergeStoredSettings(value: unknown): AppSettings {
  const result = cloneDefaults();
  if (!isRecord(value)) return result;
  const ui = isRecord(value.ui) ? value.ui : {};
  const performance = isRecord(value.performance) ? value.performance : {};
  const graphing = isRecord(value.graphing) ? value.graphing : {};
  if (isValidHexColor(ui.accentColor)) result.ui.accentColor = ui.accentColor;
  const storedPalette = Array.isArray(ui.palette) ? ui.palette : graphing.palette;
  if (Array.isArray(storedPalette) && storedPalette.length === GRAPH_PALETTE.length && storedPalette.every(isValidHexColor)) {
    result.ui.palette = [...storedPalette];
  }
  if (ui.density === 'compact' || ui.density === 'comfortable') result.ui.density = ui.density;
  if (ui.fontScale === 'small' || ui.fontScale === 'medium' || ui.fontScale === 'large') result.ui.fontScale = ui.fontScale;
  if (typeof ui.reducedMotion === 'boolean') result.ui.reducedMotion = ui.reducedMotion;
  if (typeof performance.mode === 'string' && PERFORMANCE_MODES.includes(performance.mode as typeof PERFORMANCE_MODES[number])) result.performance.mode = performance.mode as typeof PERFORMANCE_MODES[number];
  if (typeof graphing.showGrid === 'boolean') result.graphing.showGrid = graphing.showGrid;
  if (typeof graphing.showAxes === 'boolean') result.graphing.showAxes = graphing.showAxes;
  if (typeof graphing.resetViewportOnOpen === 'boolean') result.graphing.resetViewportOnOpen = graphing.resetViewportOnOpen;
  if (typeof graphing.fullscreenOnOpen === 'boolean') result.graphing.fullscreenOnOpen = graphing.fullscreenOnOpen;
  if (typeof graphing.preserveExpressionOrder === 'boolean') result.graphing.preserveExpressionOrder = graphing.preserveExpressionOrder;
  if (typeof graphing.lineThickness === 'number' && graphing.lineThickness >= 1 && graphing.lineThickness <= 6) result.graphing.lineThickness = graphing.lineThickness;
  if (typeof graphing.samplingQuality === 'string' && SAMPLING_QUALITIES.includes(graphing.samplingQuality as typeof SAMPLING_QUALITIES[number])) result.graphing.samplingQuality = graphing.samplingQuality as typeof SAMPLING_QUALITIES[number];
  if (isValidHexColor(graphing.expressionOutlineColor)) result.graphing.expressionOutlineColor = graphing.expressionOutlineColor;
  return result;
}

export class SettingsStore {
  private settings: AppSettings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    this.settings = mergeStoredSettings(readStoredSettings(storage));
    this.storage = storage;
  }

  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;

  getSettings(): AppSettings {
    return structuredClone(this.settings);
  }

  updateCategory<K extends SettingsCategory>(category: K, update: Partial<AppSettings[K]>): void {
    this.settings = mergeStoredSettings({ ...this.settings, [category]: { ...this.settings[category], ...update } });
    persistSettings(this.settings, this.storage);
    for (const listener of this.listeners) listener(this.getSettings());
  }

  resetCategory(category: SettingsCategory): void {
    const defaults = cloneDefaults();
    this.settings = { ...this.settings, [category]: defaults[category] };
    persistSettings(this.settings, this.storage);
    for (const listener of this.listeners) listener(this.getSettings());
  }

  resetAll(): void {
    this.settings = cloneDefaults();
    persistSettings(this.settings, this.storage);
    for (const listener of this.listeners) listener(this.getSettings());
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settingsStore = new SettingsStore();
export const getSettings = (): AppSettings => settingsStore.getSettings();
