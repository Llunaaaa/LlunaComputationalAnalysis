export interface ConstantDefinition {
  symbol: string;
  name: string;
  engineIdentifier: string;
  description: string;
}

export const CONSTANTS_CATALOG: readonly ConstantDefinition[] = [
  { symbol: 'π', name: 'Pi', engineIdentifier: 'pi', description: 'Circle circumference divided by diameter.' },
  { symbol: 'e', name: 'Euler number', engineIdentifier: 'e', description: 'Base of the natural logarithm.' },
  { symbol: 'φ', name: 'Golden ratio', engineIdentifier: 'phi', description: 'The positive root of x² − x − 1.' },
  { symbol: '∞', name: 'Infinity', engineIdentifier: 'infinity', description: 'Infinity representation for supported limits.' },
];
