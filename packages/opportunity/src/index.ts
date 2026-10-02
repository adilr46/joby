/**
 * `@joby/opportunity` — the Opportunity module's public interface.
 *
 * Opportunity owns opportunity sourcing, import, canonical records and provenance. It does **not**
 * implement understanding or evaluation: those live in Opportunity's legacy Intelligence partition.
 *
 * Consumers get the contract and the factory, never the implementing class.
 */

export { createOpportunity } from './factory';

export type { EvidenceText, OpportunityModule, OpportunitySummary } from './contract';
export type { CaptureEvidenceInput, CaptureEvidenceResult } from './capture';
export {
  EvidenceTooLargeError,
  OpportunityNotFoundError,
  UnsupportedEvidenceError,
} from './capture';

export { EVIDENCE_KINDS, SUPPORTED_CONTENT_TYPES } from './model';
export type {
  EvidenceKind,
  Opportunity,
  OpportunityEvidence,
  OpportunityEvidenceContent,
  OpportunityRecord,
} from './model';

// --- UC02: understanding the external situation --------------------------------------------------

export { createOpportunityUnderstanding } from './understanding/factory';
export type { CreateOpportunityUnderstandingOptions } from './understanding/factory';
export { OpportunityNotCapturedError } from './understanding/understanding';
export type {
  InterpretRunResult,
  OpportunityEvidenceReader,
  OpportunityUnderstandingService,
} from './understanding/understanding';
export type { StoredUnderstanding } from './understanding/understanding-repository';

export { DeterministicOpportunityInterpreter } from './understanding/deterministic-interpreter';
export { InterpretationError } from './understanding/interpretation-port';
export type {
  EvidenceForInterpretation,
  InterpretationRequest,
  InterpretationResult,
  InterpretedUnderstanding,
  OpportunityInterpreter,
} from './understanding/interpretation-port';

export { OPPORTUNITY_CONDITION_KINDS } from './understanding/model';
export type { OpportunityConditionKind, OpportunityUnderstanding } from './understanding/model';
