export interface UnitDefinition {
  id: string;
  quantity: string;
  name: string;
  symbol: string;
  category: 'SI base' | 'SI derived' | 'SI prefix';
  kind: 'base' | 'derived' | 'prefix';
  dimensions: Record<string, number>;
  expression: string;
  formula?: string;
}

const base: UnitDefinition[] = [
  ['second', 'Time', 'second', 's'],
  ['metre', 'Length', 'metre', 'm'],
  ['kilogram', 'Mass', 'kilogram', 'kg'],
  ['ampere', 'Electric Current', 'ampere', 'A'],
  ['kelvin', 'Thermodynamic Temperature', 'kelvin', 'K'],
  ['mole', 'Amount of Substance', 'mole', 'mol'],
  ['candela', 'Luminous Intensity', 'candela', 'cd'],
].map(([id, quantity, name, symbol]) => ({
  id, quantity, name, symbol, category: 'SI base' as const, kind: 'base' as const,
  dimensions: { [id]: 1 }, expression: '∅',
}));

const derivedData: [string, string, string, string, string][] = [
  ['radian', 'Plane angle', 'radian', 'rad', 'm * m^-1 = 1'],
  ['steradian', 'Solid angle', 'steradian', 'sr', 'm^2 * m^-2 = 1'],
  ['hertz', 'Frequency', 'hertz', 'Hz', 's^-1'],
  ['newton', 'Force', 'newton', 'N', 'kg * m * s^-2'],
  ['pascal', 'Pressure, Stress', 'pascal', 'Pa', 'N/m^2 = kg * m^-1 * s^-2'],
  ['joule', 'Energy, Work, Heat', 'joule', 'J', 'N * m = kg * m^2 * s^-2'],
  ['watt', 'Power, Radiant Flux', 'watt', 'W', 'J/s = kg * m^2 * s^-3'],
  ['coulomb', 'Electric Charge', 'coulomb', 'C', 'A * s'],
  ['volt', 'Voltage, Potential Difference', 'volt', 'V', 'W/A = kg * m^2 * s^-3 * A^-1'],
  ['farad', 'Capacitance', 'farad', 'F', 'C/V = kg^-1 * m^-2 * s^4 * A^2'],
  ['ohm', 'Electrical Resistance', 'ohm', 'Ω', 'V/A = kg * m^2 * s^-3 * A^-2'],
  ['siemens', 'Electrical Conductance', 'siemens', 'S', 'A/V = kg^-1 * m^-2 * s^3 * A^2'],
  ['weber', 'Magnetic Flux', 'weber', 'Wb', 'V * s = kg * m^2 * s^-2 * A^-1'],
  ['tesla', 'Magnetic Flux Density', 'tesla', 'T', 'Wb/m^2 = kg * s^-2 * A^-1'],
  ['henry', 'Inductance', 'henry', 'H', 'Wb/A = kg * m^2 * s^-2 * A^-2'],
  ['degree-celsius', 'Celsius Temperature', 'degree Celsius', '°C', 'K (Offset: t(°C) = T(K) - 273.15)'],
  ['lumen', 'Luminous Flux', 'lumen', 'lm', 'cd * sr'],
  ['lux', 'Illuminance', 'lux', 'lx', 'lm/m^2 = m^-2 * cd'],
  ['becquerel', 'Activity (Radionuclide)', 'becquerel', 'Bq', 's^-1'],
  ['gray', 'Absorbed Dose, Kerma', 'gray', 'Gy', 'J/kg = m^2 * s^-2'],
  ['sievert', 'Equivalent Dose', 'sievert', 'Sv', 'J/kg = m^2 * s^-2'],
  ['katal', 'Catalytic Activity', 'katal', 'kat', 'mol * s^-1'],
];

const derived = derivedData.map(([id, quantity, name, symbol, expression]) => ({
  id, quantity, name, symbol, category: 'SI derived' as const, kind: 'derived' as const,
  dimensions: {}, expression,
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
  ...prefixes.map(([id, symbol, expression]) => ({
    id, quantity: 'SI Prefix', name: id, symbol, category: 'SI prefix' as const,
    kind: 'prefix' as const, dimensions: {}, expression,
  })),
];

export function filterUnits(query: string, category = 'all', kind = 'all'): UnitDefinition[] {
  const normalized = query.trim().toLowerCase();
  return UNITS_CATALOG.filter((unit) =>
    (category === 'all' || unit.category === category) &&
    (kind === 'all' || unit.kind === kind) &&
    (!normalized || `${unit.quantity} ${unit.name} ${unit.symbol} ${unit.id} ${unit.expression}`.toLowerCase().includes(normalized)));
}
