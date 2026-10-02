import type {
  OpportunityEvaluation,
  OpportunityPolicyRecommendation,
  OpportunityRankingItem,
} from './opportunity-decisioning';

export function recommendOpportunityPolicy(input: {
  readonly evaluations: readonly OpportunityEvaluation[];
  readonly ranking: readonly OpportunityRankingItem[];
}): readonly OpportunityPolicyRecommendation[] {
  const evaluationsById = new Map(input.evaluations.map((evaluation) => [evaluation.opportunityId, evaluation]));
  return input.ranking.map((item) => {
    const evaluation = evaluationsById.get(item.opportunityId)!;
    const highConflict = evaluation.constraintAssessments.some(
      (assessment) => assessment.status === 'conflict' && assessment.materiality === 'high',
    );
    if (highConflict) {
      return { opportunityId: item.opportunityId, action: 'hold', reasons: ['High-materiality constraint conflict needs attention.'] };
    }
    if (evaluation.confidence < 0.4 || evaluation.uncertainty.unknowns.length > 1) {
      return { opportunityId: item.opportunityId, action: 'recommend_research', reasons: ['Evaluation is promising but under-evidenced.'] };
    }
    if (item.tier === 'Tier 1') {
      return { opportunityId: item.opportunityId, action: 'recommend_apply', reasons: ['Strong ranked opportunity with adequate confidence.'] };
    }
    if (item.tier === 'Tier 2') {
      return { opportunityId: item.opportunityId, action: 'surface', reasons: ['Viable opportunity worth keeping visible.'] };
    }
    return { opportunityId: item.opportunityId, action: 'deprioritize', reasons: ['Low current evaluation relative to the comparison set.'] };
  });
}
