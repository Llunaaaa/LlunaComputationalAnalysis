import type { Evaluation } from './types.ts';

export interface FormattedEvaluation {
  text: string;
  isApproximate: boolean;
}

export function formatEvaluation(evaluation: Evaluation, showFraction: boolean): FormattedEvaluation {
  if (showFraction) return { text: evaluation.exact ?? '', isApproximate: false };
  if (evaluation.display_value) {
    return {
      text: evaluation.display_value,
      isApproximate: evaluation.is_approximate || Boolean(evaluation.exact && evaluation.display_value !== evaluation.exact),
    };
  }
  return {
    text: evaluation.exact || (evaluation.value === null ? '' : String(evaluation.value)),
    isApproximate: evaluation.is_approximate,
  };
}
