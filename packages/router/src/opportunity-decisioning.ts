export type EvaluationLabel = 'strong' | 'consider' | 'weak';
export type EvaluationBand = EvaluationLabel;
export type OpportunityTier = 'Tier 1' | 'Tier 2' | 'Tier 3';
export type CalibrationDiagnostic = 'separating' | 'flat' | 'inverted' | 'insufficient';
export type CalibrationState = 'uncalibrated' | 'calibrated';

export interface EvaluationDimensions {
  readonly requirementFit: number;
  readonly trajectoryValue: number;
  readonly developmentValue: number;
  readonly constraintsFit: number;
  readonly representationLeverage: number;
  readonly marketQuality: number;
  readonly pursuitCost: number;
}

export type EvaluationWeights = Readonly<Record<keyof EvaluationDimensions, number>>;

export interface EvaluationUncertainty {
  readonly gaps: readonly string[];
  readonly unsupportedClaims: readonly string[];
  readonly unknowns: readonly string[];
}

export interface DimensionEvaluation {
  readonly value: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export type DimensionEvaluations = Readonly<Record<keyof EvaluationDimensions, DimensionEvaluation>>;

export interface EvaluationCalibration {
  readonly state: CalibrationState;
  readonly diagnostic?: CalibrationDiagnostic;
  readonly calibratedScore?: number;
  readonly supportingApplications: number;
  readonly reason: string;
}

export interface EvaluationEvidenceReference {
  readonly source: 'identity' | 'opportunity' | 'representation' | 'pci' | 'stated_context';
  readonly id: string;
  readonly label: string;
}

export interface RequirementAssessment {
  readonly requirement: string;
  readonly importance: 'required' | 'preferred' | 'unknown';
  readonly match: 'met' | 'partial' | 'gap' | 'unknown';
  readonly evidenceStrength: 'strong' | 'moderate' | 'weak' | 'none';
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly confidence: number;
}

export interface ConstraintAssessment {
  readonly kind: string;
  readonly status: 'aligned' | 'conflict' | 'unknown';
  readonly materiality: 'low' | 'medium' | 'high';
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly note?: string;
}

export interface OpportunityEvaluation {
  readonly personId: string;
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  readonly comparisonSetId: string;
  readonly rawScore: number;
  readonly score: number;
  /** Compatibility alias while callers migrate to `score`. */
  readonly evaluationScore: number;
  readonly label: EvaluationLabel;
  /** Compatibility alias while callers migrate to `label`. */
  readonly evaluationBand: EvaluationBand;
  readonly dimensions: EvaluationDimensions;
  readonly dimensionEvaluations: DimensionEvaluations;
  readonly weightsUsed: EvaluationWeights;
  readonly confidence: number;
  readonly dimensionConfidence: Partial<Record<keyof EvaluationDimensions, number>>;
  readonly calibration: EvaluationCalibration;
  readonly uncertainty: EvaluationUncertainty;
  readonly constraintAssessments: readonly ConstraintAssessment[];
  readonly requirementAssessments: readonly RequirementAssessment[];
  readonly evidenceReferences: readonly EvaluationEvidenceReference[];
  readonly evaluationVersion: string;
}

export interface OpportunityRankingItem {
  readonly opportunityId: string;
  readonly rank: number;
  readonly rankScore: number;
  readonly tier: OpportunityTier;
  readonly evaluationScore: number;
  readonly explorationAdjustment: ExplorationAdjustment;
  readonly rankingReasons: readonly string[];
}

export interface OpportunityTierGroup {
  readonly tier: OpportunityTier;
  readonly opportunityIds: readonly string[];
}

export interface PairwiseOpportunityComparison {
  readonly leftOpportunityId: string;
  readonly rightOpportunityId: string;
  readonly preference: 'left' | 'right' | 'similar' | 'neither';
  readonly scoreDelta: number;
  readonly reasons: readonly string[];
}

export interface ExplorationAdjustment {
  readonly direction: -1 | 0 | 1;
  readonly magnitude: number;
  readonly reason: string;
}

export type OpportunityPolicyAction =
  | 'surface'
  | 'recommend_apply'
  | 'recommend_research'
  | 'recommend_stretch'
  | 'explore'
  | 'hold'
  | 'deprioritize';

export interface OpportunityPolicyRecommendation {
  readonly opportunityId: string;
  readonly action: OpportunityPolicyAction;
  readonly reasons: readonly string[];
}

export interface OpportunityDecisioningResult {
  readonly personId: string;
  readonly comparisonSetId: string;
  readonly evaluations: readonly OpportunityEvaluation[];
  readonly ranking: readonly OpportunityRankingItem[];
  readonly tiers: readonly OpportunityTierGroup[];
  readonly pairwise: readonly PairwiseOpportunityComparison[];
  readonly policy: readonly OpportunityPolicyRecommendation[];
}

export interface EvaluatableOpportunity {
  readonly opportunityId: string;
  readonly revision: number;
  readonly requiredCapabilities: readonly string[];
  readonly preferredCapabilities: readonly string[];
  readonly conditions?: Partial<Record<string, readonly string[]>>;
  readonly responsibilities?: readonly string[];
  readonly uncertainty?: readonly string[];
}

export interface OpportunityEvaluationReader {
  getEvaluatableOpportunity(opportunityId: string): Promise<EvaluatableOpportunity | undefined>;
}

export interface EvidenceCapability {
  readonly capability: string;
  readonly evidenceId: string;
  readonly label: string;
}

export interface StatedCondition {
  readonly kind: string;
  readonly values: readonly string[];
}

export interface RouterEvaluationIdentityReader {
  listEvidenceCapabilities(personId: string): Promise<readonly EvidenceCapability[]>;
  listStatedConditions(personId: string): Promise<readonly StatedCondition[]>;
}

export interface EvaluationPriorSource {
  weightsFor(input: {
    readonly personId: string;
    readonly opportunityIds: readonly string[];
  }): Promise<Partial<EvaluationWeights>>;
}

export interface EvaluationCalibrationSource {
  calibrate(input: {
    readonly personId: string;
    readonly opportunityId: string;
    readonly rawScore: number;
    readonly dimensions: EvaluationDimensions;
    readonly weights: EvaluationWeights;
  }): Promise<EvaluationCalibration>;
}

export class NoEvaluationCalibration implements EvaluationCalibrationSource {
  async calibrate(): Promise<EvaluationCalibration> {
    return {
      state: 'uncalibrated',
      diagnostic: 'insufficient',
      supportingApplications: 0,
      reason: 'No resolved Application history is available for calibration.',
    };
  }
}

export type OutcomeEvidenceClass = 'direct_feedback' | 'stage_inference' | 'weak_inference' | 'opaque';

export interface RouterTrainingObservation {
  readonly personId: string;
  readonly opportunityId: string;
  readonly evaluationVersion: string;
  readonly representationTrack?: string;
  readonly decision?: string;
  readonly representationUsed?: string;
  readonly worldResponse?: string;
  readonly feedback?: readonly string[];
  readonly outcomeEvidenceClass: OutcomeEvidenceClass;
  readonly interpretationConfidence: number;
}

export class NoEvaluationPriors implements EvaluationPriorSource {
  async weightsFor(): Promise<Partial<EvaluationWeights>> {
    return {};
  }
}

export const EVALUATION_VERSION = 'router-opportunity-evaluation/v1';

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  requirementFit: 0.24,
  trajectoryValue: 0.16,
  developmentValue: 0.14,
  constraintsFit: 0.18,
  representationLeverage: 0.1,
  marketQuality: 0.1,
  pursuitCost: 0.08,
};

export const DIMENSION_KINDS: readonly (keyof EvaluationDimensions)[] = [
  'requirementFit',
  'trajectoryValue',
  'developmentValue',
  'constraintsFit',
  'representationLeverage',
  'marketQuality',
  'pursuitCost',
];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normaliseWeights(weights: Partial<EvaluationWeights>): EvaluationWeights {
  const positive = Object.fromEntries(
    DIMENSION_KINDS.map((key) => [key, Math.max(0, weights[key] ?? DEFAULT_EVALUATION_WEIGHTS[key])]),
  ) as Record<keyof EvaluationDimensions, number>;
  const total = DIMENSION_KINDS.reduce((sum, key) => sum + positive[key], 0);
  if (total === 0) return DEFAULT_EVALUATION_WEIGHTS;
  return Object.fromEntries(DIMENSION_KINDS.map((key) => [key, positive[key] / total])) as unknown as EvaluationWeights;
}

export function labelFor(score: number): EvaluationLabel {
  if (score >= 0.7) return 'strong';
  if (score >= 0.4) return 'consider';
  return 'weak';
}

export function tierFor(input: { rank: number; evaluationScore: number; absoluteQuality: number }): OpportunityTier {
  const quality = Math.min(input.evaluationScore, input.absoluteQuality);
  if (input.rank <= 3 && quality >= 0.7) return 'Tier 1';
  if (quality >= 0.4) return 'Tier 2';
  return 'Tier 3';
}
