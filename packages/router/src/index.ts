/**
 * `@joby/router` — the Router authority (ADR 0031).
 *
 * Sits between Identity and Opportunity and owns read-only opportunity decisioning: which
 * Representation should seed Adaptation, how a set of opportunities evaluates for this person, how
 * they rank, and what policy action Joby recommends. It writes nothing upstream.
 */

export { Router, NoLearnedPriors, OpportunityNotRoutableError } from './router';
export { createRouter } from './factory';
export { OpportunityEvaluator, OpportunityNotEvaluatableError } from './opportunity-evaluation';
export { rankOpportunities } from './opportunity-ranking';
export { rankList, projectTiers, comparePair, compareAllPairs } from './opportunity-ranking';
export { recommendOpportunityPolicy } from './opportunity-policy';
export { topsis } from './topsis';
export { DEFAULT_EVALUATION_WEIGHTS, DIMENSION_KINDS, NoEvaluationPriors } from './opportunity-decisioning';
export {
  InMemoryWeightStateStore,
  REPRESENTATION_FAMILY_WEIGHT_PRIORS,
  WEIGHT_LEARNING_RATES,
  normalizeWeights,
  resolveWeights,
  updateWeights,
} from './weights';
export { InMemoryOpportunityEvaluationHistoryStore } from './evaluation-history';
export { LinearLtrModel } from './ltr';

export type {
  RepresentationRouting,
  RoutableOpportunity,
  RoutableRepresentation,
  RouterIdentityReader,
  RouterOpportunityReader,
  RouterOptions,
  RouterPriorSource,
  RoutingCandidate,
} from './router';

export type {
  ConstraintAssessment,
  CalibrationDiagnostic,
  CalibrationState,
  DimensionEvaluation,
  DimensionEvaluations,
  EvaluatableOpportunity,
  EvaluationBand,
  EvaluationCalibration,
  EvaluationCalibrationSource,
  EvaluationDimensions,
  EvaluationEvidenceReference,
  EvaluationLabel,
  EvaluationPriorSource,
  EvaluationUncertainty,
  EvaluationWeights,
  ExplorationAdjustment,
  EvidenceCapability,
  OpportunityDecisioningResult,
  OpportunityEvaluation,
  OpportunityEvaluationReader,
  OpportunityPolicyAction,
  OpportunityPolicyRecommendation,
  OpportunityRankingItem,
  OpportunityTier,
  OpportunityTierGroup,
  OutcomeEvidenceClass,
  PairwiseOpportunityComparison,
  RequirementAssessment,
  RouterEvaluationIdentityReader,
  RouterTrainingObservation,
  StatedCondition,
} from './opportunity-decisioning';

export type {
  RepresentationFamily,
  WeightLearningScope,
} from './weights';
export type {
  OpportunityEvaluationHistoryStore,
  OpportunityEvaluationRun,
} from './evaluation-history';
export type {
  PairwisePreference,
  RankingFeatureVector,
} from './ltr';
