import { settingsStore } from './settingsState.ts';
import type { AppSettings } from './settingsTypes.ts';

export type SettingsTabId = 'ui' | 'performance' | 'constants' | 'units' | 'equations' | 'graphing';
export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  render: (settings: AppSettings) => string;
}

function option(value: string, selected: string, label = value): string {
  return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`;
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function renderUI(settings: AppSettings): string {
  return `<div class="settings-grid">
    <label class="settings-control"><span>Theme</span><select data-setting="theme" disabled>${option('dark', settings.ui.theme, 'Dark')}</select><small>Dark theme is currently the supported theme.</small></label>
    <label class="settings-control"><span>Accent color</span><button type="button" class="settings-color-button" data-settings-color="accentColor" style="--settings-color:${settings.ui.accentColor}" aria-label="Choose accent color"></button><small>Used for interface highlights and graph expression outlines.</small></label>
    <label class="settings-control"><span>UI density</span><select data-setting="density">${option('comfortable', settings.ui.density, 'Comfortable')}${option('compact', settings.ui.density, 'Compact')}</select></label>
    <label class="settings-control"><span>Font size</span><select data-setting="fontScale">${option('small', settings.ui.fontScale, 'Small')}${option('medium', settings.ui.fontScale, 'Medium')}${option('large', settings.ui.fontScale, 'Large')}</select><small>Math expression rendering remains independent.</small></label>
    <div class="settings-control palette-setting"><span>20-color palette</span><div class="palette-preview">${settings.ui.palette.map((color, index) => `<button type="button" class="palette-color-button" data-settings-color="palette-${index}" style="--settings-color:${color}" aria-label="Edit palette color ${index + 1}"></button>`).join('')}</div><small>Shared by graph expressions and color menus.</small></div>
    <label class="settings-check"><input data-setting="reducedMotion" type="checkbox"${settings.ui.reducedMotion ? ' checked' : ''}> Reduce nonessential motion</label>
  </div>`;
}

function renderPerformance(settings: AppSettings): string {
  const descriptions = {
    efficiency: 'Lowest resource usage, conservative concurrency, and lower rendering quality during interaction.',
    standard: 'Balanced resource usage with smooth interaction and adaptive graph sampling.',
    performance: 'Higher rendering quality and more background work with higher resource usage.',
  };
  return `<div class="settings-panel">
    <div class="performance-control"><h3>Performance mode</h3><div class="performance-options">${(['efficiency', 'standard', 'performance'] as const).map((mode) => `<label class="${settings.performance.mode === mode ? 'selected' : ''}"><input type="radio" name="performance-mode" value="${mode}"${settings.performance.mode === mode ? ' checked' : ''}>${titleCase(mode)}</label>`).join('')}</div><p data-performance-description>${descriptions[settings.performance.mode]}</p></div>
    <p class="settings-note">This preference is currently persisted for future scheduling and rendering controls. It never changes mathematical results.</p>
  </div>`;
}

function renderConstants(): string {
  return '<div class="settings-placeholder"><p>Constants settings will be redesigned in a future update.</p></div>';
}

function renderUnits(): string {
  return '<div class="settings-placeholder"><p>Units settings will be redesigned in a future update.</p></div>';
}

function renderEquations(): string {
  return '<div class="settings-placeholder"><p class="eyebrow">Equations</p><p>Equation preferences will be added in a future update.</p></div>';
}

function renderGraphing(settings: AppSettings): string {
  return `<div class="settings-grid">
    <label class="settings-check"><input data-graph-setting="showGrid" type="checkbox"${settings.graphing.showGrid ? ' checked' : ''}> Show grid</label>
    <label class="settings-check"><input data-graph-setting="showAxes" type="checkbox"${settings.graphing.showAxes ? ' checked' : ''}> Show axes</label>
    <label class="settings-control"><span>Sampling quality</span><select data-graph-setting="samplingQuality">${option('low', settings.graphing.samplingQuality, 'Low')}${option('standard', settings.graphing.samplingQuality, 'Standard')}${option('high', settings.graphing.samplingQuality, 'High')}</select></label>
    <label class="settings-control"><span>Line thickness</span><input data-graph-setting="lineThickness" type="range" min="1" max="6" step="1" value="${settings.graphing.lineThickness}"></label>
    <label class="settings-control"><span>Graph expression outline</span><button type="button" class="settings-color-button" data-settings-color="expressionOutlineColor" style="--settings-color:${settings.graphing.expressionOutlineColor}" aria-label="Choose graph expression outline color"></button><small>Independent from expression line colors.</small></label>
    <label class="settings-check"><input data-graph-setting="preserveExpressionOrder" type="checkbox"${settings.graphing.preserveExpressionOrder ? ' checked' : ''}> Preserve expression ordering</label>
    <label class="settings-check"><input data-graph-setting="resetViewportOnOpen" type="checkbox"${settings.graphing.resetViewportOnOpen ? ' checked' : ''}> Reset viewport when opening Graph</label>
  </div>`;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: 'ui', label: 'UI', render: renderUI },
  { id: 'performance', label: 'Performance', render: renderPerformance },
  { id: 'constants', label: 'Constants', render: renderConstants },
  { id: 'units', label: 'Units', render: renderUnits },
  { id: 'equations', label: 'Equations', render: renderEquations },
  { id: 'graphing', label: 'Graphing', render: renderGraphing },
];

export { settingsStore };
