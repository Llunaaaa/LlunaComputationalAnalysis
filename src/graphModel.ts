// Pure (DOM-free) model of the graph expression list. Every row is a LaTeX
// string; everything else — curves, sliders, derived variables, errors — is a
// function of those strings. Slider drags rewrite a row's LaTeX (e.g. `a=3.25`),
// so the model never has a second source of truth.
//
// Env layout shared by every compiled program: slot 0 is x, slots 1..n are the
// variables in `names` order, bound calculus variables follow.

import { latexToEngine } from './latexConverter.ts';
import { compileExpression, isReservedName, type Program } from './expression.ts';

export type EntryKind = 'blank' | 'curve' | 'vertical' | 'variable' | 'invalid';

export interface Classification {
  kind: EntryKind;
  /** Engine text of the plotted expression or variable definition. */
  body?: string;
  name?: string;
  /** Set when a variable is assigned a plain number, which makes it a slider. */
  literal?: number;
  error?: string;
}

export interface Entry extends Classification {
  id: number;
  program?: Program;
  /** Index into `names` for variables. */
  slot?: number;
}

export interface RowSource {
  id: number;
  latex: string;
}

const NAME = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?$/;
const LITERAL = /^-?(?:\d+\.?\d*|\.\d+)$/;
const PROGRAM_CACHE_LIMIT = 512;

const invalid = (error: string): Classification => ({ kind: 'invalid', error });
const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

export function classify(latex: string): Classification {
  let engine: string;
  try {
    engine = latexToEngine(latex).trim();
  } catch (caught) {
    return invalid(messageOf(caught));
  }
  if (!engine) return { kind: 'blank' };

  const parts = engine.split('=').map((part) => part.trim());
  if (parts.length === 1) return { kind: 'curve', body: engine };
  if (parts.length > 2) return invalid('Only one "=" is allowed per expression');
  const [lhs, rhs] = parts;
  if (!lhs) return invalid('Expected a name before "="');
  if (!rhs) return invalid('Expected an expression after "="');
  if (lhs === 'y') return { kind: 'curve', body: rhs };
  if (rhs === 'y') return { kind: 'curve', body: lhs };
  if (lhs === 'x') return { kind: 'vertical', body: rhs };
  if (!NAME.test(lhs)) return invalid('The left side must be y, x, or a variable name');
  if (isReservedName(lhs)) return invalid(`'${lhs}' is a built-in name and cannot be redefined`);

  const compact = rhs.replace(/\s+/g, '');
  return LITERAL.test(compact)
    ? { kind: 'variable', name: lhs, body: rhs, literal: Number(compact) }
    : { kind: 'variable', name: lhs, body: rhs };
}

export class GraphModel {
  entries: Entry[] = [];
  /** Variable names in slot order (env slot = index + 1). */
  names: string[] = [];
  /** Current variable values, aligned with `names`. NaN when undefined. */
  values = new Float64Array(0);

  private classified = new Map<number, { latex: string; result: Classification }>();
  private programs = new Map<string, Program | Error>();
  /** Definitions (non-slider variables) in dependency order. */
  private definitionOrder: Entry[] = [];

  /** Re-derives every entry. Only rows whose LaTeX changed are re-parsed and
   *  only bodies whose text or variable set changed are recompiled. */
  update(rows: readonly RowSource[]): void {
    const live = new Set<number>();
    const entries: Entry[] = rows.map(({ id, latex }) => {
      live.add(id);
      let cached = this.classified.get(id);
      if (!cached || cached.latex !== latex) {
        cached = { latex, result: classify(latex) };
        this.classified.set(id, cached);
      }
      return { id, ...cached.result };
    });
    for (const id of this.classified.keys()) if (!live.has(id)) this.classified.delete(id);

    const names: string[] = [];
    const slotOf = new Map<string, number>();
    for (const entry of entries) {
      if (entry.kind !== 'variable') continue;
      if (slotOf.has(entry.name!)) {
        entry.kind = 'invalid';
        entry.error = `'${entry.name}' is already defined`;
        continue;
      }
      entry.slot = names.length;
      slotOf.set(entry.name!, names.length);
      names.push(entry.name!);
    }

    const globals = ['x', ...names];
    const key = globals.join(',');
    for (const entry of entries) {
      if (entry.kind === 'blank' || entry.kind === 'invalid' || entry.literal !== undefined) continue;
      const compiled = this.compile(entry.body!, globals, key);
      if (compiled instanceof Error) {
        entry.error = compiled.message;
        continue;
      }
      if (entry.kind !== 'curve' && compiled.uses.has('x')) {
        entry.error = entry.kind === 'vertical'
          ? 'x = … must not depend on x'
          : `'${entry.name}' cannot depend on x`;
        continue;
      }
      entry.program = compiled;
    }

    this.definitionOrder = orderDefinitions(entries, slotOf);
    this.entries = entries;
    this.names = names;
    this.values = new Float64Array(names.length);
    this.resolve();
  }

  /** Recomputes variable values (sliders, then definitions in dependency order). */
  resolve(): void {
    const values = this.values.fill(Number.NaN);
    for (const entry of this.entries) {
      if (entry.kind === 'variable' && entry.literal !== undefined && entry.slot !== undefined) {
        values[entry.slot] = entry.literal;
      }
    }
    for (const entry of this.definitionOrder) {
      const env = this.environment(entry.program!);
      values[entry.slot!] = entry.program!.evaluate(env);
    }
  }

  /** A fresh env for `program` with the current variable values loaded. */
  environment(program: Program): Float64Array {
    const env = new Float64Array(program.slotCount);
    env.set(this.values, 1);
    return env;
  }

  /** The values of the variables `program` reads, for cache keys. */
  dependencyKey(program: Program): string {
    let key = '';
    for (let i = 0; i < this.names.length; i += 1) {
      if (program.uses.has(this.names[i])) key += `${this.values[i]},`;
    }
    return key;
  }

  private compile(body: string, globals: string[], globalsKey: string): Program | Error {
    const cacheKey = `${globalsKey}\u0000${body}`;
    let compiled = this.programs.get(cacheKey);
    if (!compiled) {
      try {
        compiled = compileExpression(body, globals);
      } catch (caught) {
        compiled = new Error(messageOf(caught));
      }
      if (this.programs.size >= PROGRAM_CACHE_LIMIT) this.programs.clear();
      this.programs.set(cacheKey, compiled);
    }
    return compiled;
  }
}

/** Topologically orders variable definitions; entries on a cycle get an error. */
function orderDefinitions(entries: Entry[], slotOf: Map<string, number>): Entry[] {
  const definitions = new Map<string, Entry>();
  for (const entry of entries) {
    if (entry.kind === 'variable' && entry.program && !entry.error) definitions.set(entry.name!, entry);
  }
  const order: Entry[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string): boolean => {
    const mark = state.get(name);
    if (mark === 'done') return true;
    if (mark === 'visiting') return false;
    const entry = definitions.get(name);
    if (!entry) return true;
    state.set(name, 'visiting');
    let acyclic = true;
    for (const used of entry.program!.uses) {
      if (slotOf.has(used) && !visit(used)) acyclic = false;
    }
    state.set(name, 'done');
    if (acyclic) order.push(entry);
    else entry.error = `Circular definition involving '${name}'`;
    return acyclic;
  };
  for (const name of definitions.keys()) visit(name);
  return order;
}
