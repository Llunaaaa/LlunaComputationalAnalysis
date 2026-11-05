export interface Evaluation {
  value: number | null;
  exact: string | null;
  display_value: string | null;
  is_approximate: boolean;
  error: string | null;
}

export interface Row {
  id: number;
  latex: string;
  evaluation: Evaluation | null;
  evaluating: boolean;
  showFraction: boolean;
  /** Incremented per edit/evaluation so stale engine responses are dropped. */
  request: number;
}
