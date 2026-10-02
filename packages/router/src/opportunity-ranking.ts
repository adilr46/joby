import {
  DIMENSION_KINDS,
  tierFor,
  type ExplorationAdjustment,
  type OpportunityEvaluation,
  type OpportunityTierGroup,
  type PairwiseOpportunityComparison,
  type OpportunityRankingItem,
} from './opportunity-decisioning';

export interface OpportunityRankingProjection {
  readonly ranking: readonly OpportunityRankingItem[];
  readonly tiers: readonly OpportunityTierGroup[];
  readonly pairwise: readonly PairwiseOpportunityComparison[];
}

export function rankOpportunities(evaluations: readonly OpportunityEvaluation[]): OpportunityRankingProjection {
  const ranked = [...evaluations]
    .map((evaluation) => {
      const explorationAdjustment = explorationFor(evaluation);
      return {
        evaluation,
        explorationAdjustment,
        rankScore: evaluation.score + explorationAdjustment.direction * explorationAdjustment.magnitude,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore || b.evaluation.confidence - a.evaluation.confidence || a.evaluation.opportunityId.localeCompare(b.evaluation.opportunityId));

  const ranking = ranked.map(({ evaluation, explorationAdjustment, rankScore }, index) => {
      const rank = index + 1;
      return {
        opportunityId: evaluation.opportunityId,
        rank,
        rankScore,
        tier: tierFor({
          rank,
          evaluationScore: evaluation.score,
          absoluteQuality: absoluteQuality(evaluation),
        }),
        evaluationScore: evaluation.score,
        explorationAdjustment,
        rankingReasons: [`${evaluation.label} evaluation with ${Math.round(evaluation.confidence * 100)}% confidence.`],
      };
    });

  return {
    ranking,
    tiers: projectTiers(ranking),
    pairwise: compareAllPairs(ranking),
  };
}

export function rankList(evaluations: readonly OpportunityEvaluation[]): readonly OpportunityRankingItem[] {
  return rankOpportunities(evaluations).ranking;
}

function absoluteQuality(evaluation: OpportunityEvaluation): number {
  return DIMENSION_KINDS.reduce((sum, key) => sum + evaluation.dimensions[key], 0) / DIMENSION_KINDS.length;
}

export function projectTiers(ranking: readonly OpportunityRankingItem[]): readonly OpportunityTierGroup[] {
  return (['Tier 1', 'Tier 2', 'Tier 3'] as const).map((tier) => ({
    tier,
    opportunityIds: ranking.filter((item) => item.tier === tier).map((item) => item.opportunityId),
  }));
}

export function compareAllPairs(ranking: readonly OpportunityRankingItem[]): readonly PairwiseOpportunityComparison[] {
  const comparisons: PairwiseOpportunityComparison[] = [];
  for (let left = 0; left < ranking.length; left += 1) {
    for (let right = left + 1; right < ranking.length; right += 1) {
      const a = ranking[left]!;
      const b = ranking[right]!;
      const delta = a.rankScore - b.rankScore;
      comparisons.push({
        leftOpportunityId: a.opportunityId,
        rightOpportunityId: b.opportunityId,
        preference: Math.abs(delta) < 0.05 ? 'similar' : delta > 0 ? 'left' : 'right',
        scoreDelta: delta,
        reasons: [`${a.opportunityId} rank score differs from ${b.opportunityId} by ${delta.toFixed(3)}.`],
      });
    }
  }
  return comparisons;
}

export function comparePair(
  left: OpportunityRankingItem,
  right: OpportunityRankingItem,
): PairwiseOpportunityComparison {
  const delta = left.rankScore - right.rankScore;
  return {
    leftOpportunityId: left.opportunityId,
    rightOpportunityId: right.opportunityId,
    preference: Math.abs(delta) < 0.05 ? 'similar' : delta > 0 ? 'left' : 'right',
    scoreDelta: delta,
    reasons: [`${left.opportunityId} rank score differs from ${right.opportunityId} by ${delta.toFixed(3)}.`],
  };
}

function explorationFor(evaluation: OpportunityEvaluation): ExplorationAdjustment {
  const uncertainty = 1 - evaluation.confidence;
  if (uncertainty < 0.5) {
    return { direction: 0, magnitude: 0, reason: 'Confidence is high enough that no exploration perturbation is applied.' };
  }
  const direction = deterministicDirection(evaluation.opportunityId);
  return {
    direction,
    magnitude: direction === 0 ? 0 : 0.15 * uncertainty,
    reason:
      direction === 0
        ? 'Bounded exploration chose normal ranking for this uncertain opportunity.'
        : 'Bounded exploration applied a small symmetric perturbation to an uncertain opportunity.',
  };
}

function deterministicDirection(opportunityId: string): -1 | 0 | 1 {
  const bucket = [...opportunityId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10;
  if (bucket === 0) return 1;
  if (bucket === 1) return -1;
  return 0;
}
