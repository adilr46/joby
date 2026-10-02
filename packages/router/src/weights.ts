import {
  DEFAULT_EVALUATION_WEIGHTS,
  normaliseWeights,
  type EvaluationDimensions,
  type EvaluationWeights,
} from './opportunity-decisioning';

export type RepresentationFamily =
  | 'SWE'
  | 'Quant'
  | 'Finance / IB'
  | 'Product'
  | 'Research'
  | 'Founder / Operator'
  | 'Commercial / Solutions';

export type WeightLearningScope = 'application-specific' | 'representation-track' | 'overall-trajectory';

export const REPRESENTATION_FAMILY_WEIGHT_PRIORS: Readonly<Record<RepresentationFamily, EvaluationWeights>> = {
  SWE: normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    requirementFit: 0.26,
    developmentValue: 0.18,
    trajectoryValue: 0.16,
  }),
  Quant: normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    requirementFit: 0.28,
    marketQuality: 0.14,
    constraintsFit: 0.14,
  }),
  'Finance / IB': normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    marketQuality: 0.18,
    pursuitCost: 0.12,
    constraintsFit: 0.16,
  }),
  Product: normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    trajectoryValue: 0.2,
    representationLeverage: 0.14,
    developmentValue: 0.16,
  }),
  Research: normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    trajectoryValue: 0.22,
    developmentValue: 0.2,
    marketQuality: 0.08,
  }),
  'Founder / Operator': normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    trajectoryValue: 0.22,
    developmentValue: 0.2,
    pursuitCost: 0.12,
  }),
  'Commercial / Solutions': normaliseWeights({
    ...DEFAULT_EVALUATION_WEIGHTS,
    representationLeverage: 0.16,
    trajectoryValue: 0.18,
    requirementFit: 0.22,
  }),
};

export const WEIGHT_LEARNING_RATES: Readonly<Record<WeightLearningScope, number>> = {
  'application-specific': 0.3,
  'representation-track': 0.12,
  'overall-trajectory': 0.04,
};

export function normalizeWeights(weights: Partial<EvaluationWeights>): EvaluationWeights {
  return normaliseWeights(weights);
}

export function resolveWeights(input?: {
  readonly family?: RepresentationFamily;
  readonly overrides?: Partial<EvaluationWeights>;
}): EvaluationWeights {
  return normaliseWeights({
    ...(input?.family ? REPRESENTATION_FAMILY_WEIGHT_PRIORS[input.family] : DEFAULT_EVALUATION_WEIGHTS),
    ...(input?.overrides ?? {}),
  });
}

export function updateWeights(
  oldWeights: EvaluationWeights,
  evidenceVector: Partial<EvaluationWeights>,
  alpha: number,
): EvaluationWeights {
  const evidence = normaliseWeights(evidenceVector);
  const boundedAlpha = Math.min(1, Math.max(0, alpha));
  return normaliseWeights(
    Object.fromEntries(
      Object.keys(oldWeights).map((key) => {
        const dimension = key as keyof EvaluationDimensions;
        return [dimension, (1 - boundedAlpha) * oldWeights[dimension] + boundedAlpha * evidence[dimension]];
      }),
    ) as Partial<EvaluationWeights>,
  );
}

export class InMemoryWeightStateStore {
  readonly #weights = new Map<string, EvaluationWeights>();

  get(key: string): EvaluationWeights | undefined {
    return this.#weights.get(key);
  }

  update(input: {
    readonly key: string;
    readonly evidenceVector: Partial<EvaluationWeights>;
    readonly scope: WeightLearningScope;
  }): EvaluationWeights {
    const oldWeights = this.#weights.get(input.key) ?? DEFAULT_EVALUATION_WEIGHTS;
    const next = updateWeights(oldWeights, input.evidenceVector, WEIGHT_LEARNING_RATES[input.scope]);
    this.#weights.set(input.key, next);
    return next;
  }
}
