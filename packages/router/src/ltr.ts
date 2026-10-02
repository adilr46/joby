import { DIMENSION_KINDS, type EvaluationDimensions, type EvaluationWeights } from './opportunity-decisioning';

export interface RankingFeatureVector {
  readonly evaluationScore: number;
  readonly dimensions: EvaluationDimensions;
  readonly weights: EvaluationWeights;
  readonly representationTrack?: string;
  readonly opportunityFeatures?: Partial<Record<string, number>>;
}

export interface PairwisePreference {
  readonly preferred: RankingFeatureVector;
  readonly other: RankingFeatureVector;
}

export class LinearLtrModel {
  readonly #weights = new Map<string, number>();

  score(vector: RankingFeatureVector): number {
    return features(vector).reduce((sum, feature) => sum + feature.value * (this.#weights.get(feature.name) ?? defaultWeight(feature.name)), 0);
  }

  trainPairwise(input: PairwisePreference, learningRate = 0.1): void {
    const preferred = features(input.preferred);
    const other = features(input.other);
    const delta = this.score(input.preferred) - this.score(input.other);
    const gradientScale = 1 - sigmoid(delta);
    for (const feature of preferred) {
      this.#weights.set(
        feature.name,
        (this.#weights.get(feature.name) ?? defaultWeight(feature.name)) + learningRate * gradientScale * feature.value,
      );
    }
    for (const feature of other) {
      this.#weights.set(
        feature.name,
        (this.#weights.get(feature.name) ?? defaultWeight(feature.name)) - learningRate * gradientScale * feature.value,
      );
    }
  }
}

function features(vector: RankingFeatureVector): { readonly name: string; readonly value: number }[] {
  return [
    { name: 'evaluationScore', value: vector.evaluationScore },
    ...DIMENSION_KINDS.map((key) => ({ name: `dimension.${key}`, value: vector.dimensions[key] })),
    ...DIMENSION_KINDS.map((key) => ({ name: `weight.${key}`, value: vector.weights[key] })),
    ...Object.entries(vector.opportunityFeatures ?? {}).map(([name, value]) => ({ name: `opportunity.${name}`, value: value ?? 0 })),
  ];
}

function defaultWeight(name: string): number {
  return name === 'evaluationScore' ? 1 : 0;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
