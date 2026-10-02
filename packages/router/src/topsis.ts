import {
  DIMENSION_KINDS,
  clamp01,
  type EvaluationDimensions,
  type EvaluationWeights,
} from './opportunity-decisioning';

export interface TopsisAlternative {
  readonly id: string;
  readonly dimensions: EvaluationDimensions;
}

export interface TopsisScore {
  readonly id: string;
  readonly score: number;
}

export function topsis(
  alternatives: readonly TopsisAlternative[],
  weights: EvaluationWeights,
): readonly TopsisScore[] {
  if (alternatives.length === 0) return [];

  const weighted = alternatives.map((alternative) => ({
    id: alternative.id,
    values: Object.fromEntries(
      DIMENSION_KINDS.map((key) => {
        return [key, clamp01(alternative.dimensions[key]) * weights[key]];
      }),
    ) as Record<keyof EvaluationDimensions, number>,
  }));

  const ideal = Object.fromEntries(DIMENSION_KINDS.map((key) => [key, weights[key]])) as Record<
    keyof EvaluationDimensions,
    number
  >;
  const antiIdeal = Object.fromEntries(DIMENSION_KINDS.map((key) => [key, 0])) as Record<
    keyof EvaluationDimensions,
    number
  >;

  return weighted.map((alternative) => {
    const distanceToIdeal = distance(alternative.values, ideal);
    const distanceToAntiIdeal = distance(alternative.values, antiIdeal);
    const denominator = distanceToIdeal + distanceToAntiIdeal;
    return {
      id: alternative.id,
      score: denominator === 0 ? 1 : clamp01(distanceToAntiIdeal / denominator),
    };
  });
}

function distance(
  a: Record<keyof EvaluationDimensions, number>,
  b: Record<keyof EvaluationDimensions, number>,
): number {
  return Math.sqrt(DIMENSION_KINDS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0));
}
