export interface UnitDefinition {
  id: string;
  name: string;
  symbol: string;
  category: string;
  kind: 'base' | 'derived' | 'prefix';
  dimensions: Record<string, number>;
  formula?: string;
  description?: string;
}

const base: UnitDefinition[] = [
  ['second', 'Second', 's'], ['metre', 'Metre', 'm'], ['kilogram', 'Kilogram', 'kg'],
  ['ampere', 'Ampere', 'A'], ['kelvin', 'Kelvin', 'K'], ['mole', 'Mole', 'mol'], ['candela', 'Candela', 'cd'],
].map(([id, name, symbol]) => ({ id, name, symbol, category: 'SI base', kind: 'base', dimensions: { [id]: 1 } }));

const derivedData: [string, string, string, string][] = [
  ['radian', 'Radian', 'rad', '1'], ['steradian', 'Steradian', 'sr', '1'], ['hertz', 'Hertz', 'Hz', 's^-1'],
  ['newton', 'Newton', 'N', 'kg*m*s^-2'], ['pascal', 'Pascal', 'Pa', 'kg*m^-1*s^-2'], ['joule', 'Joule', 'J', 'kg*m^2*s^-2'],
  ['watt', 'Watt', 'W', 'kg*m^2*s^-3'], ['coulomb', 'Coulomb', 'C', 'A*s'], ['volt', 'Volt', 'V', 'kg*m^2*s^-3*A^-1'],
  ['farad', 'Farad', 'F', 'kg^-1*m^-2*s^4*A^2'], ['ohm', 'Ohm', 'Ω', 'kg*m^2*s^-3*A^-2'],
  ['siemens', 'Siemens', 'S', 'kg^-1*m^-2*s^3*A^2'], ['weber', 'Weber', 'Wb', 'kg*m^2*s^-2*A^-1'],
  ['tesla', 'Tesla', 'T', 'kg*s^-2*A^-1'], ['henry', 'Henry', 'H', 'kg*m^2*s^-2*A^-2'],
  ['degree-celsius', 'Degree Celsius', 'degC', 'temperature'], ['lumen', 'Lumen', 'lm', 'cd*sr'], ['lux', 'Lux', 'lx', 'cd*sr*m^-2'],
];
const derived = derivedData.map(([id, name, symbol, formula]) => ({
  id, name, symbol, category: 'SI derived', kind: 'derived' as const, dimensions: {}, formula,
}));

const prefixes: [string, string, string][] = [
  ['quetta', 'Q', '10^30'], ['ronna', 'R', '10^27'], ['yotta', 'Y', '10^24'], ['zetta', 'Z', '10^21'],
  ['exa', 'E', '10^18'], ['peta', 'P', '10^15'], ['tera', 'T', '10^12'], ['giga', 'G', '10^9'],
  ['mega', 'M', '10^6'], ['kilo', 'k', '10^3'], ['hecto', 'h', '10^2'], ['deka', 'da', '10^1'],
  ['deci', 'd', '10^-1'], ['centi', 'c', '10^-2'], ['milli', 'm', '10^-3'], ['micro', 'μ', '10^-6'],
  ['nano', 'n', '10^-9'], ['pico', 'p', '10^-12'], ['femto', 'f', '10^-15'], ['atto', 'a', '10^-18'],
  ['zepto', 'z', '10^-21'], ['yocto', 'y', '10^-24'], ['ronto', 'r', '10^-27'], ['quecto', 'q', '10^-30'],
];

export const UNITS_CATALOG: readonly UnitDefinition[] = [
  ...base,
  ...derived,
  ...prefixes.map(([id, symbol, formula]) => ({ id, name: id[0].toUpperCase() + id.slice(1), symbol, category: 'SI prefix', kind: 'prefix' as const, dimensions: {}, formula })),
];

export function filterUnits(query: string, category = 'all', kind = 'all'): UnitDefinition[] {
  const normalized = query.trim().toLowerCase();
  return UNITS_CATALOG.filter((unit) =>
    (category === 'all' || unit.category === category) &&
    (kind === 'all' || unit.kind === kind) &&
    (!normalized || `${unit.name} ${unit.symbol} ${unit.id} ${unit.formula ?? ''}`.toLowerCase().includes(normalized)));
}
