import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVALUATION_WEIGHTS,
  InMemoryOpportunityEvaluationHistoryStore,
  InMemoryWeightStateStore,
  LinearLtrModel,
  comparePair,
  normalizeWeights,
  projectTiers,
  resolveWeights,
  updateWeights,
  type EvaluationWeights,
  type OpportunityEvaluationRun,
  type OpportunityRankingItem,
  type RankingFeatureVector,
} from './index';

const evidenceVector: Partial<EvaluationWeights> = {
  developmentValue: 0.5,
  trajectoryValue: 0.3,
  requirementFit: 0.1,
};

describe('weight priors and fast preference updates', () => {
  it('resolves representation-family priors without requiring manual percentages', () => {
    const swe = resolveWeights({ family: 'SWE' });
    expect(swe.requirementFit).toBeGreaterThan(DEFAULT_EVALUATION_WEIGHTS.requirementFit);
    expect(Object.values(swe).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it('moves gradually toward preference evidence', () => {
    const slow = updateWeights(DEFAULT_EVALUATION_WEIGHTS, evidenceVector, 0.04);
    const fast = updateWeights(DEFAULT_EVALUATION_WEIGHTS, evidenceVector, 0.3);

    expect(fast.developmentValue - DEFAULT_EVALUATION_WEIGHTS.developmentValue).toBeGreaterThan(
      slow.developmentValue - DEFAULT_EVALUATION_WEIGHTS.developmentValue,
    );
    expect(fast.developmentValue).toBeLessThan(normalizeWeights(evidenceVector).developmentValue);
  });

  it('persists current learned weight state separately from canonical identity', () => {
    const store = new InMemoryWeightStateStore();
    const once = store.update({ key: 'person-1:SWE', evidenceVector, scope: 'representation-track' });
    const twice = store.update({ key: 'person-1:SWE', evidenceVector, scope: 'representation-track' });

    expect(twice.developmentValue).toBeGreaterThan(once.developmentValue);
    expect(store.get('person-1:SWE')).toEqual(twice);
  });
});

describe('evaluation history', () => {
  it('records append-only decision-time evaluation runs', async () => {
    const store = new InMemoryOpportunityEvaluationHistoryStore();
    const run = (id: string): OpportunityEvaluationRun => ({
      evaluationId: id,
      personId: 'person-1',
      opportunityId: 'opp-1',
      dimensions: {
        requirementFit: 1,
        trajectoryValue: 0.5,
        developmentValue: 0.5,
        constraintsFit: 1,
        representationLeverage: 1,
        marketQuality: 0.5,
        pursuitCost: 0.6,
      },
      weightsUsed: DEFAULT_EVALUATION_WEIGHTS,
      rawEvaluationScore: 0.7,
      evaluationScore: 0.7,
      label: 'strong',
      confidence: 0.6,
      modelVersion: 'v1',
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    });

    await store.record(run('eval-1'));
    await store.record(run('eval-2'));

    expect(await store.listForApplication({ personId: 'person-1', opportunityId: 'opp-1' })).toHaveLength(2);
  });
});

describe('LTR v1', () => {
  const vector = (score: number, developmentValue: number): RankingFeatureVector => ({
    evaluationScore: score,
    weights: DEFAULT_EVALUATION_WEIGHTS,
    dimensions: {
      requirementFit: score,
      trajectoryValue: 0.5,
      developmentValue,
      constraintsFit: 0.5,
      representationLeverage: 0.5,
      marketQuality: 0.5,
      pursuitCost: 0.5,
    },
  });

  it('learns a personalized ordering beyond evaluationScore from pairwise preferences', () => {
    const model = new LinearLtrModel();
    const highDevelopment = vector(0.6, 1);
    const highScore = vector(0.8, 0);

    for (let i = 0; i < 80; i += 1) model.trainPairwise({ preferred: highDevelopment, other: highScore }, 0.2);

    expect(model.score(highDevelopment)).toBeGreaterThan(model.score(highScore));
  });
});

describe('ranking projections', () => {
  it('projects tiers and pairwise comparison from ranking items', () => {
    const items: OpportunityRankingItem[] = [
      {
        opportunityId: 'a',
        rank: 1,
        rankScore: 0.8,
        tier: 'Tier 1',
        evaluationScore: 0.8,
        explorationAdjustment: { direction: 0, magnitude: 0, reason: 'none' },
        rankingReasons: [],
      },
      {
        opportunityId: 'b',
        rank: 2,
        rankScore: 0.6,
        tier: 'Tier 2',
        evaluationScore: 0.6,
        explorationAdjustment: { direction: 0, magnitude: 0, reason: 'none' },
        rankingReasons: [],
      },
    ];

    expect(projectTiers(items)[0]).toEqual({ tier: 'Tier 1', opportunityIds: ['a'] });
    expect(comparePair(items[0]!, items[1]!).preference).toBe('left');
  });
});
