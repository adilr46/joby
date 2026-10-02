import { describe, expect, it } from 'vitest';

import {
  createRouter,
  topsis,
  type EvaluatableOpportunity,
  type EvaluationWeights,
  type EvidenceCapability,
  type RoutableOpportunity,
  type StatedCondition,
} from './index';

const weights: EvaluationWeights = {
  requirementFit: 0.25,
  trajectoryValue: 0.15,
  developmentValue: 0.1,
  constraintsFit: 0.2,
  representationLeverage: 0.1,
  marketQuality: 0.1,
  pursuitCost: 0.1,
};

describe('TOPSIS', () => {
  it('scores the alternative closest to benefit ideals highest', () => {
    const result = topsis(
      [
        {
          id: 'weak',
          dimensions: {
            requirementFit: 0.2,
            trajectoryValue: 0.4,
            developmentValue: 0.4,
            constraintsFit: 0.5,
            representationLeverage: 0.2,
            marketQuality: 0.5,
            pursuitCost: 0.5,
          },
        },
        {
          id: 'strong',
          dimensions: {
            requirementFit: 1,
            trajectoryValue: 0.8,
            developmentValue: 0.7,
            constraintsFit: 1,
            representationLeverage: 1,
            marketQuality: 0.7,
            pursuitCost: 0.2,
          },
        },
      ],
      weights,
    );

    expect(result.find((item) => item.id === 'strong')!.score).toBeGreaterThan(
      result.find((item) => item.id === 'weak')!.score,
    );
  });

  it('combines pursuitCost as an already-inverted utility', () => {
    const result = topsis(
      [
        {
          id: 'cheap',
          dimensions: {
            requirementFit: 1,
            trajectoryValue: 1,
            developmentValue: 1,
            constraintsFit: 1,
            representationLeverage: 1,
            marketQuality: 1,
            pursuitCost: 1,
          },
        },
        {
          id: 'expensive',
          dimensions: {
            requirementFit: 1,
            trajectoryValue: 1,
            developmentValue: 1,
            constraintsFit: 1,
            representationLeverage: 1,
            marketQuality: 1,
            pursuitCost: 0,
          },
        },
      ],
      weights,
    );

    expect(result.find((item) => item.id === 'cheap')!.score).toBeGreaterThan(
      result.find((item) => item.id === 'expensive')!.score,
    );
  });
});

describe('Router opportunity decisioning', () => {
  const routable: RoutableOpportunity = {
    opportunityId: 'opp-1',
    revision: 1,
    requiredCapabilities: [],
    preferredCapabilities: [],
  };
  const opportunity = (id: string, patch: Partial<EvaluatableOpportunity>): EvaluatableOpportunity => ({
    opportunityId: id,
    revision: 1,
    requiredCapabilities: [],
    preferredCapabilities: [],
    ...patch,
  });
  const capability = (name: string): EvidenceCapability => ({
    capability: name,
    evidenceId: `ev-${name}`,
    label: name,
  });
  const condition = (kind: string, values: readonly string[]): StatedCondition => ({ kind, values });

  function router(options: {
    readonly opportunities: ReadonlyMap<string, EvaluatableOpportunity>;
    readonly capabilities?: readonly EvidenceCapability[];
    readonly conditions?: readonly StatedCondition[];
  }) {
    return createRouter({
      identity: { listRoutableRepresentations: async () => [] },
      opportunities: { getRoutableOpportunity: async () => routable },
      opportunityDecisioning: {
        identity: {
          listEvidenceCapabilities: async () => options.capabilities ?? [],
          listStatedConditions: async () => options.conditions ?? [],
        },
        opportunities: {
          getEvaluatableOpportunity: async (id) => options.opportunities.get(id),
        },
      },
    });
  }

  it('returns evaluations, ranking and policy as separate Router-owned outputs', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      opportunities: new Map([
        ['opp-1', opportunity('opp-1', { requiredCapabilities: ['Python'] })],
        ['opp-2', opportunity('opp-2', { requiredCapabilities: ['Rust'] })],
      ]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1', 'opp-2'] });

    expect(result.evaluations).toHaveLength(2);
    expect(result.ranking[0]!.opportunityId).toBe('opp-1');
    expect(result.policy.map((item) => item.opportunityId).sort()).toEqual(['opp-1', 'opp-2']);
  });

  it('keeps policy actions out of OpportunityEvaluation', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      opportunities: new Map([['opp-1', opportunity('opp-1', { requiredCapabilities: ['Python'] })]]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1'] });

    expect(Object.keys(result.evaluations[0]!).sort()).toEqual([
      'calibration',
      'comparisonSetId',
      'confidence',
      'constraintAssessments',
      'dimensionConfidence',
      'dimensionEvaluations',
      'dimensions',
      'evaluationBand',
      'evaluationScore',
      'evaluationVersion',
      'evidenceReferences',
      'label',
      'opportunityId',
      'opportunityRevision',
      'personId',
      'rawScore',
      'requirementAssessments',
      'score',
      'uncertainty',
      'weightsUsed',
    ]);
    expect(JSON.stringify(result.evaluations[0]).toLowerCase()).not.toMatch(/recommend_apply|hold|deprioritize|skip|ask_user/);
  });

  it('preserves high estimated quality with low confidence instead of converting uncertainty into a penalty', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      opportunities: new Map([
        ['known', opportunity('known', { requiredCapabilities: ['Python'], responsibilities: ['Build systems'] })],
        ['thin', opportunity('thin', { requiredCapabilities: ['Python'], uncertainty: ['Market quality not stated'] })],
      ]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['known', 'thin'] });

    const thin = result.evaluations.find((item) => item.opportunityId === 'thin')!;
    expect(thin.dimensions.requirementFit).toBe(1);
    expect(thin.uncertainty.unknowns).toContain('Market quality not stated');
    expect(thin.confidence).toBeLessThan(0.6);
  });

  it('surfaces high-materiality constraint conflicts without removing the opportunity from evaluation', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      conditions: [condition('work_authorisation', ['UK'])],
      opportunities: new Map([
        [
          'opp-1',
          opportunity('opp-1', {
            requiredCapabilities: ['Python'],
            conditions: { work_authorisation: ['US'] },
          }),
        ],
      ]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1'] });

    expect(result.evaluations[0]!.constraintAssessments).toMatchObject([
      { kind: 'work_authorisation', status: 'conflict', materiality: 'high' },
    ]);
    expect(result.policy[0]!.action).toBe('hold');
  });

  it('does not assign S tier to the best item in a poor comparison set', async () => {
    const result = await router({
      opportunities: new Map([
        ['opp-1', opportunity('opp-1', { requiredCapabilities: ['Python'] })],
        ['opp-2', opportunity('opp-2', { requiredCapabilities: ['Rust'] })],
      ]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1', 'opp-2'] });

    expect(result.ranking[0]!.rank).toBe(1);
    expect(result.ranking[0]!.tier).not.toBe('Tier 1');
  });

  it('falls back to raw score when calibration is insufficient', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      opportunities: new Map([['opp-1', opportunity('opp-1', { requiredCapabilities: ['Python'] })]]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1'] });

    expect(result.evaluations[0]!.calibration).toMatchObject({
      state: 'uncalibrated',
      diagnostic: 'insufficient',
      supportingApplications: 0,
    });
    expect(result.evaluations[0]!.score).toBe(result.evaluations[0]!.rawScore);
  });

  it('returns listwise, tiered and pairwise projections from the same ranking output', async () => {
    const result = await router({
      capabilities: [capability('Python')],
      opportunities: new Map([
        ['opp-1', opportunity('opp-1', { requiredCapabilities: ['Python'] })],
        ['opp-2', opportunity('opp-2', { requiredCapabilities: ['Rust'] })],
      ]),
    }).routeOpportunities({ personId: 'person-1', opportunityIds: ['opp-1', 'opp-2'] });

    expect(result.ranking).toHaveLength(2);
    expect(result.tiers.map((tier) => tier.tier)).toEqual(['Tier 1', 'Tier 2', 'Tier 3']);
    expect(result.pairwise).toHaveLength(1);
    expect(result.ranking[0]!.explorationAdjustment).toHaveProperty('direction');
  });
});
