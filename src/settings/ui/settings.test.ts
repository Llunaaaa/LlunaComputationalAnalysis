import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_PALETTE } from './settingsDefaults.ts';
import { createMemoryStorage } from './settingsPersistence.ts';
import { isValidHexColor, SettingsStore } from './settingsState.ts';
import { filterUnits, UNITS_CATALOG } from '../units/unitsCatalog.ts';

test('settings use explicit defaults and persist valid updates', () => {
  const storage = createMemoryStorage();
  const store = new SettingsStore(storage);
  assert.equal(store.getSettings().performance.mode, 'standard');
  store.updateCategory('performance', { mode: 'performance' });
  store.updateCategory('ui', { accentColor: '#123456', density: 'compact' });
  const restored = new SettingsStore(storage).getSettings();
  assert.equal(restored.performance.mode, 'performance');
  assert.equal(restored.ui.accentColor, '#123456');
  assert.equal(restored.ui.density, 'compact');
});

test('corrupt, incomplete, and invalid persisted values fall back safely', () => {
  const storage = createMemoryStorage();
  storage.setItem('lca.settings', JSON.stringify({
    version: 99,
    ui: { accentColor: 'not-a-color', density: 'invalid' },
    performance: { mode: 'turbo' },
    graphing: { palette: ['#000000'], lineThickness: 99 },
  }));
  const settings = new SettingsStore(storage).getSettings();
  assert.equal(settings.ui.accentColor, '#a7e635');
  assert.equal(settings.ui.density, 'comfortable');
  assert.equal(settings.performance.mode, 'standard');
  assert.equal(settings.graphing.lineThickness, 2);
  assert.deepEqual(settings.ui.palette, [...GRAPH_PALETTE]);
  storage.setItem('lca.settings', '{broken');
  assert.equal(new SettingsStore(storage).getSettings().version, 1);
});

test('category reset leaves other categories untouched', () => {
  const store = new SettingsStore(createMemoryStorage());
  store.updateCategory('ui', { density: 'compact' });
  store.updateCategory('performance', { mode: 'performance' });
  store.resetCategory('ui');
  assert.equal(store.getSettings().ui.density, 'comfortable');
  assert.equal(store.getSettings().performance.mode, 'performance');
});

test('color validation and SI catalog coverage', () => {
  assert.equal(isValidHexColor('#abcdef'), true);
  assert.equal(isValidHexColor('#abc'), false);
  assert.equal(UNITS_CATALOG.filter((unit) => unit.kind === 'base').length, 7);
  for (const id of ['newton', 'pascal', 'joule', 'watt', 'coulomb', 'volt', 'farad', 'ohm', 'siemens', 'weber', 'tesla', 'henry', 'lumen', 'lux']) {
    assert.ok(UNITS_CATALOG.some((unit) => unit.id === id));
  }
  for (const id of ['becquerel', 'gray', 'sievert', 'katal']) assert.ok(UNITS_CATALOG.some((unit) => unit.id === id));
  assert.equal(UNITS_CATALOG.filter((unit) => unit.kind === 'prefix').length, 24);
  assert.equal(UNITS_CATALOG.some((unit) => /inch|foot|yard|mile|pound/i.test(unit.name)), false);
  assert.equal(filterUnits('newton')[0].symbol, 'N');
});
