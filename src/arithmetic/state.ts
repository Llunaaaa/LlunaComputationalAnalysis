import { invoke } from '@tauri-apps/api/core';
import { latexToEngine } from '../general/latex/index.ts';
import type { Evaluation, Row } from './types.ts';

export const MIN_ROWS = 2;

const EVALUATION_TIMEOUT_MS = 30_000;
const ANS_PATTERN = /\\operatorname\{ans\}|\\mathrm\{ans\}|\bans\b/gi;
const EXACT_RATIONAL = /^-?\d+(?:\/\d+)?$/;

let nextId = 1;
const newRow = (latex = ''): Row => ({
  id: nextId++,
  latex,
  evaluation: null,
  evaluating: false,
  showFraction: false,
  request: 0,
});

export const rows: Row[] = [newRow('3^{2-6}'), newRow()];
let initialEvaluationStarted = false;
let paint: ((row: Row) => void) | null = null;

const errorResult = (error: string): Evaluation =>
  ({ value: null, exact: null, display_value: null, is_approximate: false, error });

const messageOf = (caught: unknown) =>
  caught instanceof Error ? caught.message : typeof caught === 'string' ? caught : 'Evaluation failed';

async function invokeEvaluation(expression: string): Promise<Evaluation> {
  let timer = 0;
  try {
    return await Promise.race([
      invoke<Evaluation>('evaluate', { expression }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Evaluation timed out')), EVALUATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Minimum row count plus exactly one trailing blank row. Returns added rows. */
export function enforceInvariants(): Row[] {
  const added: Row[] = [];
  while (rows.length < MIN_ROWS || rows[rows.length - 1].latex.trim()) {
    const row = newRow();
    rows.push(row);
    added.push(row);
  }
  return added;
}

/** Replaces `ans` with the closest previous result; exact when it is rational. */
function substituteAns(latex: string, index: number): string {
  ANS_PATTERN.lastIndex = 0;
  if (!ANS_PATTERN.test(latex)) return latex;
  for (let i = index - 1; i >= 0; i -= 1) {
    const evaluation = rows[i].evaluation;
    if (!evaluation || evaluation.error || evaluation.value === null) continue;
    const exact = evaluation.exact?.replace(/\s+/g, '');
    const text = exact && EXACT_RATIONAL.test(exact) && !evaluation.is_approximate ? exact : String(evaluation.value);
    return latex.replace(ANS_PATTERN, `(${text})`);
  }
  throw new Error("'ans' has no previous value");
}

export function setPainter(next: ((row: Row) => void) | null): () => void {
  paint = next;
  return () => {
    if (paint === next) paint = null;
  };
}

export function updateRow(row: Row, latex: string): void {
  row.latex = latex;
  row.request += 1;
  if (row.evaluation || row.evaluating) {
    row.evaluation = null;
    row.evaluating = false;
    paint?.(row);
  }
}

export function removeRow(row: Row): void {
  row.request += 1;
  const index = rows.indexOf(row);
  if (index >= 0) rows.splice(index, 1);
}

export async function evaluateRow(row: Row): Promise<void> {
  const request = ++row.request;
  row.evaluating = true;
  paint?.(row);
  let evaluation: Evaluation;
  try {
    const expression = latexToEngine(substituteAns(row.latex, rows.indexOf(row))).trim();
    evaluation = expression
      ? await invokeEvaluation(expression)
      : errorResult('Enter an expression');
  } catch (caught) {
    evaluation = errorResult(messageOf(caught));
  }
  if (request !== row.request) return;
  row.evaluation = evaluation;
  row.evaluating = false;
  paint?.(row);
}

export function startInitialEvaluation(): void {
  if (initialEvaluationStarted) return;
  initialEvaluationStarted = true;
  for (const row of rows) {
    if (row.latex.trim() && !row.evaluation && !row.evaluating) void evaluateRow(row);
  }
}
