export type Env = Float64Array;
export type Fn = (env: Env) => number;

export interface Node {
  fn: Fn;
  // Slots the value depends on; empty means it was folded at compile time.
  deps: readonly number[];
}

export interface Program {
  evaluate: Fn;
  // Slots required by evaluate: the globals first, then bound variables.
  slotCount: number;
  // Globals actually referenced (for dependency tracking).
  uses: ReadonlySet<string>;
}
