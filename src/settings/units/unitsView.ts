import type { UnitDefinition } from './unitsCatalog.ts';
import { unitsCatalogStore } from './unitsState.ts';

export function renderUnitRows(units: readonly UnitDefinition[]): string {
  return units.map((unit) => `<tr class="${unit.enabled ? '' : 'unit-disabled'}" data-unit-id="${unit.id}"><td><input type="checkbox" data-unit-toggle ${unit.enabled ? 'checked' : ''} aria-label="Enable ${unit.name}"></td><td>${unit.quantity}</td><td>${unit.name}</td><td><code>${unit.symbol}</code></td><td><code>${unit.expression}</code></td><td><button type="button" class="unit-edit-button" data-unit-edit>Edit</button>${unit.customized ? '<button type="button" class="unit-reset-button" data-unit-reset>Reset</button>' : ''}${unit.builtIn ? '' : '<button type="button" class="unit-delete-button" data-unit-delete>Delete</button>'}</td></tr>`).join('');
}

export function renderUnits(): string {
  const catalog = unitsCatalogStore.getState();
  const units = catalog.units.filter((unit) => unit.kind !== 'prefix');
  const prefixes = catalog.units.filter((unit) => unit.kind === 'prefix');
  return `<div class="units-catalog">
    <div class="units-toolbar">
      <label class="settings-search">Search units <input data-unit-search type="search" placeholder="Search quantity, unit, symbol, or expression"></label>
      <label>Category<select data-unit-category><option value="all">All categories</option>${catalog.categories.map((category) => `<option value="${category}">${category}</option>`).join('')}</select></label>
      <label>Kind<select data-unit-kind><option value="all">All kinds</option><option value="base">Base</option><option value="derived">Derived</option><option value="prefix">Prefix</option></select></label>
      <label>Enabled<select data-unit-enabled><option value="all">All states</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
      <button type="button" class="settings-action-button" data-unit-add-category>Add category</button>
      <button type="button" class="settings-action-button" data-unit-add>Add unit</button>
    </div>
    <form class="unit-editor" data-unit-editor hidden>
      <input type="hidden" data-unit-id>
      <label>Physical quantity<input required data-unit-quantity></label>
      <label>Unit name<input required data-unit-name></label>
      <label>Symbol<input required data-unit-symbol></label>
      <label>Expression<input data-unit-expression placeholder="Blank = base unit"></label>
      <label>Category<select required data-unit-edit-category>${catalog.categories.map((category) => `<option value="${category}">${category}</option>`).join('')}</select></label>
      <label>Kind<select required data-unit-edit-kind><option value="base">Base</option><option value="derived">Derived</option><option value="prefix">Prefix</option></select></label>
      <label class="settings-check"><input type="checkbox" data-unit-edit-enabled checked> Enabled</label>
      <div><button type="submit" class="settings-action-button">Save unit</button><button type="button" class="settings-action-button" data-unit-cancel>Cancel</button></div>
      <p class="settings-form-error" data-unit-error role="alert"></p>
    </form>
    <h3 class="units-section-label">UNITS</h3>
    <div class="units-table-wrap"><table class="units-table"><thead><tr><th>Enabled</th><th>Physical Quantity</th><th>Unit Name</th><th>Symbol</th><th>Expression in Base Units / Other Units</th><th>Actions</th></tr></thead><tbody data-unit-list="units">${renderUnitRows(units)}</tbody></table></div>
    <h3 class="units-section-label">PREFIXES</h3>
    <div class="units-table-wrap"><table class="units-table"><thead><tr><th>Enabled</th><th>Prefix</th><th>Unit Name</th><th>Symbol</th><th>Expression in Base Units / Other Units</th><th>Actions</th></tr></thead><tbody data-unit-list="prefixes">${renderUnitRows(prefixes)}</tbody></table></div>
  </div>`;
}
