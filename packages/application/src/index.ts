/**
 * `@joby/application` — the Application module's public interface.
 *
 * Application owns the live lifecycle and durable structured observation of one Person x Opportunity
 * interaction (ADR 0031):
 *
 * ```text
 * Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
 * ```
 *
 * It records what was used, sent, observed and resolved. It does not become authoritative for
 * Durable Identity, Identity Representation, Opportunity or Adaptation — every reference to those
 * authorities here is an id, a revision, or a copy of material that already crossed the external
 * boundary.
 */

export { createApplication } from './factory';
export type { ApplicationModule } from './contract';
export {
  InvalidApplicationInputError,
  ApplicationAlreadyExistsError,
  InvalidApplicationOutcomeError,
  ApplicationNotFoundError,
  InterviewStageNotFoundError,
} from './contract';
export type {
  RecordExternalApplicationInput,
  AppendTimelineInput,
  CreateApplicationInput,
  RecordCommunicationInput,
  RecordInterviewStageInput,
  RecordOutcomeInput,
  RecordSubmissionInput,
} from './contract';

export {
  APPLICATION_OUTCOME_TYPES,
  INTERVIEW_STAGE_KINDS,
  OUTCOME_KINDS,
  TIMELINE_STAGES,
  canonicalApplicationOutcome,
  classifyApplicationOutcome,
  classifyOutcomeKind,
  currentState,
  deriveCurrentState,
  outcomeKindFor,
  representationOverridden,
} from './model';
export type {
  AdaptationProduced,
  Application,
  ApplicationRecord,
  Communication,
  CommunicationDirection,
  InteractionHistory,
  InterviewStage,
  InterviewStageKind,
  OpportunityStateUsed,
  ApplicationOutcomeType,
  OutcomeProgression,
  OutcomeKind,
  PersonStateUsed,
  RepresentationPriorUsed,
  ResolvedOutcome,
  SubmittedMaterial,
  SubmittedMaterialKind,
  SubmittedReality,
  TimelineEntry,
  TimelineStage,
} from './model';

export { isResolved, projectResolvedEvidence } from './resolved-evidence';
export type {
  ResolvedApplicationEvidence,
  ResolvedEvidenceFamily,
  ResolvedEvidenceSignal,
} from './resolved-evidence';
