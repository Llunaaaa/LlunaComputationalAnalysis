import type { AppSettings } from './settingsTypes.ts';

export const GRAPH_PALETTE = [
  '#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6',
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  ui: {
    theme: 'dark',
    accentColor: '#a7e635',
    palette: [...GRAPH_PALETTE],
    density: 'comfortable',
    fontScale: 'medium',
    reducedMotion: false,
  },
  performance: { mode: 'standard' },
  constants: { showBuiltIns: true },
  units: { system: 'si' },
  equations: { reserved: false },
  graphing: {
    showGrid: true,
    showAxes: true,
    resetViewportOnOpen: false,
    lineThickness: 2,
    samplingQuality: 'standard',
    preserveExpressionOrder: true,
    fullscreenOnOpen: false,
    expressionOutlineColor: '#b8f05a',
  },
};

export function cloneDefaults(): AppSettings {
  return structuredClone(DEFAULT_SETTINGS);
}
