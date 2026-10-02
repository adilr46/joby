import {
  DEFAULT_EVALUATION_WEIGHTS,
  DIMENSION_KINDS,
  EVALUATION_VERSION,
  NoEvaluationCalibration,
  NoEvaluationPriors,
  clamp01,
  labelFor,
  normaliseWeights,
  type ConstraintAssessment,
  type DimensionEvaluation,
  type DimensionEvaluations,
  type EvaluatableOpportunity,
  type EvaluationDimensions,
  type EvaluationEvidenceReference,
  type EvaluationCalibrationSource,
  type EvaluationPriorSource,
  type EvaluationUncertainty,
  type EvaluationWeights,
  type OpportunityEvaluation,
  type OpportunityEvaluationReader,
  type RequirementAssessment,
  type RouterEvaluationIdentityReader,
} from './opportunity-decisioning';
import type { OpportunityEvaluationHistoryStore } from './evaluation-history';
import { topsis } from './topsis';

export class OpportunityNotEvaluatableError extends Error {
  constructor(opportunityId: string) {
    super(`Opportunity '${opportunityId}' has no understanding to evaluate.`);
    this.name = 'OpportunityNotEvaluatableError';
  }
}

export interface OpportunityEvaluatorOptions {
  readonly identity: RouterEvaluationIdentityReader;
  readonly opportunities: OpportunityEvaluationReader;
  readonly priors?: EvaluationPriorSource;
  readonly calibration?: EvaluationCalibrationSource;
  readonly history?: OpportunityEvaluationHistoryStore;
  readonly clock?: () => Date;
}

export class OpportunityEvaluator {
  readonly #identity: RouterEvaluationIdentityReader;
  readonly #opportunities: OpportunityEvaluationReader;
  readonly #priors: EvaluationPriorSource;
  readonly #calibration: EvaluationCalibrationSource;
  readonly #history?: OpportunityEvaluationHistoryStore;
  readonly #clock: () => Date;

  constructor(options: OpportunityEvaluatorOptions) {
    this.#identity = options.identity;
    this.#opportunities = options.opportunities;
    this.#priors = options.priors ?? new NoEvaluationPriors();
    this.#calibration = options.calibration ?? new NoEvaluationCalibration();
    this.#history = options.history;
    this.#clock = options.clock ?? (() => new Date());
  }

  async evaluateOpportunitySet(input: {
    readonly personId: string;
    readonly opportunityIds: readonly string[];
    readonly comparisonSetId?: string;
    readonly weights?: Partial<EvaluationWeights>;
  }): Promise<readonly OpportunityEvaluation[]> {
    const comparisonSetId = input.comparisonSetId ?? comparisonSetIdFor(input.opportunityIds);
    const [capabilities, conditions, priorWeights] = await Promise.all([
      this.#identity.listEvidenceCapabilities(input.personId),
      this.#identity.listStatedConditions(input.personId),
      this.#priors.weightsFor({ personId: input.personId, opportunityIds: input.opportunityIds }),
    ]);
    const weights = normaliseWeights({ ...DEFAULT_EVALUATION_WEIGHTS, ...priorWeights, ...input.weights });

    const drafts = [];
    for (const opportunityId of input.opportunityIds) {
      const opportunity = await this.#opportunities.getEvaluatableOpportunity(opportunityId);
      if (!opportunity) throw new OpportunityNotEvaluatableError(opportunityId);
      drafts.push(evaluateDimensions({ personId: input.personId, opportunity, capabilities, conditions, weights, comparisonSetId }));
    }

    const scores = new Map(
      topsis(
        drafts.map((draft) => ({ id: draft.opportunityId, dimensions: draft.dimensions })),
        weights,
      ).map((item) => [item.id, item.score]),
    );

    const evaluations = await Promise.all(
      drafts.map(async (draft) => {
        const rawScore = scores.get(draft.opportunityId) ?? 0;
        const calibration = await this.#calibration.calibrate({
          personId: input.personId,
          opportunityId: draft.opportunityId,
          rawScore,
          dimensions: draft.dimensions,
          weights,
        });
        const score = calibration.calibratedScore ?? rawScore;
        return {
          ...draft,
          rawScore,
          score,
          evaluationScore: score,
          label: labelFor(score),
          evaluationBand: labelFor(score),
          calibration,
        };
      }),
    );
    await Promise.all(evaluations.map((evaluation) => this.#recordHistory(evaluation)));
    return evaluations;
  }

  async #recordHistory(evaluation: OpportunityEvaluation): Promise<void> {
    if (!this.#history) return;
    await this.#history.record({
      evaluationId: `${evaluation.evaluationVersion}:${evaluation.personId}:${evaluation.opportunityId}:${this.#clock().toISOString()}`,
      personId: evaluation.personId,
      opportunityId: evaluation.opportunityId,
      dimensions: evaluation.dimensions,
      weightsUsed: evaluation.weightsUsed,
      rawEvaluationScore: evaluation.rawScore,
      ...(evaluation.calibration.calibratedScore !== undefined
        ? { calibratedScore: evaluation.calibration.calibratedScore }
        : {}),
      evaluationScore: evaluation.score,
      label: evaluation.label,
      confidence: evaluation.confidence,
      modelVersion: evaluation.evaluationVersion,
      evaluatedAt: this.#clock().toISOString(),
    });
  }
}

function evaluateDimensions(input: {
  readonly personId: string;
  readonly opportunity: EvaluatableOpportunity;
  readonly capabilities: readonly { capability: string; evidenceId: string; label: string }[];
  readonly conditions: readonly { kind: string; values: readonly string[] }[];
  readonly weights: EvaluationWeights;
  readonly comparisonSetId: string;
}): OpportunityEvaluation {
  const required = input.opportunity.requiredCapabilities.map((requirement) =>
    assessRequirement(requirement, 'required', input.capabilities),
  );
  const preferred = input.opportunity.preferredCapabilities.map((requirement) =>
    assessRequirement(requirement, 'preferred', input.capabilities),
  );
  const requirementAssessments = [...required, ...preferred];
  const constraintAssessments = assessConstraints(input.opportunity, input.conditions);
  const unknowns = [...(input.opportunity.uncertainty ?? [])];

  const requirementFit =
    requirementAssessments.length === 0
      ? 0.5
      : average(requirementAssessments.map((item) => matchScore(item.match) * importanceWeight(item.importance)));
  const constraintsFit =
    constraintAssessments.length === 0
      ? 0.5
      : average(constraintAssessments.map((item) => constraintScore(item)));
  const representationLeverage = requirementFit;
  const developmentValue = input.opportunity.responsibilities?.length ? 0.6 : 0.5;
  const trajectoryValue = 0.5;
  const marketQuality = 0.5;
  const pursuitCost = highMaterialityConflict(constraintAssessments) ? 0.8 : 0.4;

  const dimensionEvaluations: DimensionEvaluations = {
    requirementFit: dimension(clamp01(requirementFit), requirementAssessments.length ? 0.75 : 0.35, [
      requirementAssessments.length
        ? 'Computed from grounded per-requirement evidence matches.'
        : 'No stated requirements; neutral utility with low confidence.',
    ]),
    trajectoryValue: dimension(trajectoryValue, 0.2, ['No trajectory model exists yet; neutral utility.']),
    developmentValue: dimension(developmentValue, input.opportunity.responsibilities?.length ? 0.45 : 0.25, [
      input.opportunity.responsibilities?.length
        ? 'Responsibilities indicate some development surface.'
        : 'Development surface is not stated.',
    ]),
    constraintsFit: dimension(clamp01(constraintsFit), constraintAssessments.length ? 0.7 : 0.35, [
      constraintAssessments.length ? 'Computed from stated opportunity conditions.' : 'No comparable conditions stated.',
    ]),
    representationLeverage: dimension(clamp01(representationLeverage), requirementAssessments.length ? 0.6 : 0.3, [
      'Initial proxy follows evidenced requirement coverage until Representation-specific leverage is richer.',
    ]),
    marketQuality: dimension(marketQuality, 0.2, ['No market-quality enrichment exists yet; neutral utility.']),
    pursuitCost: dimension(highMaterialityConflict(constraintAssessments) ? 0.2 : 0.6, constraintAssessments.length ? 0.55 : 0.3, [
      highMaterialityConflict(constraintAssessments)
        ? 'High-materiality constraint conflict raises pursuit cost.'
        : 'No high-materiality pursuit-cost signal found.',
    ]),
  };

  const dimensions: EvaluationDimensions = {
    requirementFit: dimensionEvaluations.requirementFit.value,
    trajectoryValue: dimensionEvaluations.trajectoryValue.value,
    developmentValue: dimensionEvaluations.developmentValue.value,
    constraintsFit: dimensionEvaluations.constraintsFit.value,
    representationLeverage: dimensionEvaluations.representationLeverage.value,
    marketQuality: dimensionEvaluations.marketQuality.value,
    pursuitCost: dimensionEvaluations.pursuitCost.value,
  };

  const gaps = requirementAssessments
    .filter((item) => item.match === 'gap' || item.match === 'unknown')
    .map((item) => `No current evidence for ${item.importance} requirement '${item.requirement}'.`);
  if (input.opportunity.requiredCapabilities.length === 0) unknowns.push('Opportunity states no required capabilities.');

  const uncertainty: EvaluationUncertainty = {
    gaps,
    unsupportedClaims: [],
    unknowns,
  };

  const dimensionConfidence = Object.fromEntries(
    DIMENSION_KINDS.map((key) => [key, dimensionEvaluations[key].confidence]),
  ) as Partial<Record<keyof EvaluationDimensions, number>>;

  return {
    personId: input.personId,
    opportunityId: input.opportunity.opportunityId,
    opportunityRevision: input.opportunity.revision,
    comparisonSetId: input.comparisonSetId,
    rawScore: 0,
    score: 0,
    evaluationScore: 0,
    label: 'weak',
    evaluationBand: 'weak',
    dimensions,
    dimensionEvaluations,
    weightsUsed: input.weights,
    confidence: average(DIMENSION_KINDS.map((key) => dimensionConfidence[key] ?? 0)),
    dimensionConfidence,
    calibration: {
      state: 'uncalibrated',
      diagnostic: 'insufficient',
      supportingApplications: 0,
      reason: 'Calibration has not run yet.',
    },
    uncertainty,
    constraintAssessments,
    requirementAssessments,
    evidenceReferences: uniqueReferences(requirementAssessments.flatMap((item) => item.evidenceReferences)),
    evaluationVersion: EVALUATION_VERSION,
  };
}

function dimension(value: number, confidence: number, reasons: readonly string[]): DimensionEvaluation {
  return { value: clamp01(value), confidence: clamp01(confidence), reasons };
}

function assessRequirement(
  requirement: string,
  importance: RequirementAssessment['importance'],
  capabilities: readonly { capability: string; evidenceId: string; label: string }[],
): RequirementAssessment {
  const matched = capabilities.filter((item) => normalise(item.capability) === normalise(requirement));
  const evidenceReferences: EvaluationEvidenceReference[] = matched.map((item) => ({
    source: 'identity',
    id: item.evidenceId,
    label: item.label,
  }));
  return {
    requirement,
    importance,
    match: matched.length > 0 ? 'met' : 'gap',
    evidenceStrength: matched.length > 0 ? 'strong' : 'none',
    evidenceReferences,
    confidence: matched.length > 0 ? 0.9 : 0.7,
  };
}

function assessConstraints(
  opportunity: EvaluatableOpportunity,
  stated: readonly { kind: string; values: readonly string[] }[],
): readonly ConstraintAssessment[] {
  return Object.entries(opportunity.conditions ?? {}).map(([kind, statedValues]) => {
    const values = statedValues ?? [];
    const person = stated.find((condition) => normalise(condition.kind) === normalise(kind));
    if (!person) return { kind, status: 'unknown', materiality: 'medium', evidenceReferences: [] };
    const aligned = values.some((value) => person.values.some((personValue) => normalise(personValue) === normalise(value)));
    return {
      kind,
      status: aligned ? 'aligned' : 'conflict',
      materiality: kind === 'work_authorisation' || kind === 'sponsorship' ? 'high' : 'medium',
      evidenceReferences: [],
      note: aligned ? undefined : `Opportunity states ${values.join(', ')}; stated context has ${person.values.join(', ')}.`,
    };
  });
}

function comparisonSetIdFor(opportunityIds: readonly string[]): string {
  return `set:${[...opportunityIds].sort().join('|')}`;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function matchScore(match: RequirementAssessment['match']): number {
  if (match === 'met') return 1;
  if (match === 'partial') return 0.5;
  if (match === 'unknown') return 0.5;
  return 0;
}

function importanceWeight(importance: RequirementAssessment['importance']): number {
  if (importance === 'required') return 1;
  if (importance === 'preferred') return 0.75;
  return 0.5;
}

function constraintScore(assessment: ConstraintAssessment): number {
  if (assessment.status === 'aligned') return 1;
  if (assessment.status === 'unknown') return 0.5;
  return assessment.materiality === 'high' ? 0 : 0.25;
}

function highMaterialityConflict(assessments: readonly ConstraintAssessment[]): boolean {
  return assessments.some((assessment) => assessment.status === 'conflict' && assessment.materiality === 'high');
}

function uniqueReferences(references: readonly EvaluationEvidenceReference[]): readonly EvaluationEvidenceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.source}:${reference.id}:${reference.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
