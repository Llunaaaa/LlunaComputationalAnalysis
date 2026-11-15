import { UNITS_CATALOG, type UnitDefinition } from './unitsCatalog.ts';

export interface UnitsCatalogState {
  categories: string[];
  units: UnitDefinition[];
}

export interface UnitInput {
  quantity: string;
  name: string;
  symbol: string;
  expression: string;
  category: string;
  kind: UnitDefinition['kind'];
  enabled: boolean;
}

const STORAGE_KEY = 'lca.units.catalog';
const DEFAULT_CATEGORY = 'SI System';
const builtIns = UNITS_CATALOG.map((unit) => ({
  ...unit,
  category: DEFAULT_CATEGORY,
  customized: false,
  original: {
    quantity: unit.quantity, name: unit.name, symbol: unit.symbol, expression: unit.expression,
    category: DEFAULT_CATEGORY, kind: unit.kind, enabled: true,
  },
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validUnit(value: unknown): value is UnitDefinition {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.quantity === 'string' &&
    typeof value.name === 'string' && typeof value.symbol === 'string' &&
    typeof value.category === 'string' && ['base', 'derived', 'prefix'].includes(String(value.kind)) &&
    typeof value.expression === 'string' && typeof value.enabled === 'boolean' &&
    typeof value.builtIn === 'boolean';
}

function readState(): UnitsCatalogState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { categories: [DEFAULT_CATEGORY], units: [...builtIns] };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.categories) || !Array.isArray(parsed.units)) throw new Error('Invalid unit catalog');
    const categories = [...new Set(parsed.categories.filter((category): category is string => typeof category === 'string' && category.trim() !== ''))];
    const units = parsed.units.filter(validUnit).map((unit) => {
      const original = unit.original ?? builtIns.find((candidate) => candidate.id === unit.id)?.original ?? {
        quantity: unit.quantity, name: unit.name, symbol: unit.symbol, expression: unit.expression,
        category: unit.category, kind: unit.kind, enabled: unit.enabled,
      };
      const customized = unit.customized ?? !sameDefinition(unit, original);
      return { ...unit, expression: unit.expression.trim(), original, customized };
    });
    return { categories: categories.includes(DEFAULT_CATEGORY) ? categories : [DEFAULT_CATEGORY, ...categories], units };
  } catch {
    return { categories: [DEFAULT_CATEGORY], units: [...builtIns] };
  }
}

function persist(state: UnitsCatalogState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Restricted WebViews may make local persistence unavailable.
  }
}

export class UnitsCatalogStore {
  private state = readState();
  private readonly listeners = new Set<(state: UnitsCatalogState) => void>();

  getState(): UnitsCatalogState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: UnitsCatalogState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create(input: UnitInput): UnitDefinition {
    this.validate(input);
    const unit: UnitDefinition = {
      id: `${input.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${input.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      ...input,
      expression: input.expression.trim() || 'null',
      builtIn: false,
      customized: false,
      original: {
        quantity: input.quantity, name: input.name, symbol: input.symbol,
        expression: input.expression.trim() || 'null', category: input.category,
        kind: input.kind, enabled: input.enabled,
      },
      dimensions: {},
    };
    this.state.units.push(unit);
    this.commit();
    return structuredClone(unit);
  }

  update(id: string, input: UnitInput): void {
    this.validate(input, id);
    const index = this.state.units.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error('Unit not found');
    const current = this.state.units[index];
    const next = { ...current, ...input, expression: input.expression.trim() || 'null' };
    this.state.units[index] = { ...next, customized: Boolean(next.original && !sameDefinition(next, next.original)) };
    this.commit();
  }

  reset(id: string): void {
    const index = this.state.units.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error('Unit not found');
    const unit = this.state.units[index];
    if (!unit.customized || !unit.original) return;
    this.state.units[index] = { ...unit, ...unit.original, customized: false, original: unit.original };
    this.commit();
  }

  setEnabled(id: string, enabled: boolean): void {
    const unit = this.state.units.find((candidate) => candidate.id === id);
    if (!unit) throw new Error('Unit not found');
    unit.enabled = enabled;
    unit.customized = Boolean(unit.original && !sameDefinition(unit, { ...unit.original, enabled }));
    this.commit();
  }

  remove(id: string): void {
    const index = this.state.units.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error('Unit not found');
    if (this.state.units[index].builtIn) throw new Error('Built-in SI units cannot be deleted');
    this.state.units.splice(index, 1);
    this.commit();
  }

  addCategory(category: string): void {
    const normalized = category.trim();
    if (!normalized || this.state.categories.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())) {
      throw new Error('Category already exists or is empty');
    }
    this.state.categories.push(normalized);
    this.commit();
  }

  private validate(input: UnitInput, editingId?: string): void {
    if (!input.quantity.trim() || !input.name.trim() || !input.symbol.trim() || !input.category.trim()) throw new Error('Quantity, name, symbol, and category are required');
    if (this.state.units.some((unit) => unit.id !== editingId && unit.symbol === input.symbol.trim())) throw new Error('Symbols must be globally unique');
    if (this.state.units.some((unit) => unit.id !== editingId && unit.category === input.category && unit.name.toLowerCase() === input.name.trim().toLowerCase())) throw new Error('Unit names must be unique within a category');
  }

  private commit(): void {
    persist(this.state);
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function sameDefinition(unit: Pick<UnitDefinition, 'quantity' | 'name' | 'symbol' | 'expression' | 'category' | 'kind' | 'enabled'>, original: NonNullable<UnitDefinition['original']>): boolean {
  return unit.quantity === original.quantity && unit.name === original.name && unit.symbol === original.symbol &&
    unit.expression === original.expression && unit.category === original.category && unit.kind === original.kind &&
    unit.enabled === original.enabled;
}

export const unitsCatalogStore = new UnitsCatalogStore();
