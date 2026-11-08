import { cloneDefaults } from './settingsDefaults.ts';
import type { AppSettings } from './settingsTypes.ts';

export const SETTINGS_STORAGE_KEY = 'lca.settings';

export function readStoredSettings(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): unknown {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings);
}

export function persistSettings(settings: AppSettings, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
  } catch {
    // Persistence is best effort in restricted WebViews.
  }
}

export function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

export function emptyPersistedSettings(): AppSettings {
  return cloneDefaults();
}
