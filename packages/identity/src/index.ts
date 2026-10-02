/**
 * `@joby/identity` — the Identity domain contract.
 *
 * **This is the surface other Joby domains depend on.** Opportunity, Adaptation, Execution, Memory and
 * Development call it in process (ADR 0001). They do not read `identity_*` tables, import internal
 * modules, or call Identity over HTTP — the HTTP surface in `apps/api` exists for external and web
 * clients only.
 *
 * It is deliberately small, and the export list is pinned by a test: widening it is a decision
 * somebody has to make on purpose.
 *
 * Not here, on purpose:
 *
 * - **Persistence and internals** — repositories, the delta classifier, the projection function,
 *   extraction validation, the GitHub ingestion service. Depending on those couples a consumer to
 *   how Identity works rather than to what it means.
 * - **Composition** — constructing the service, model adapters, the reconstruction runner, GitHub
 *   source acquisition. Those are `@joby/identity/runtime`, for Joby's own runtimes.
 * - **Test doubles** — `@joby/identity/testing`.
 *
 * Domain semantics and the locked invariants: `packages/identity/CLAUDE.md`.
 */

export type {
  DurableIdentityModule,
  DurableIdentityReader,
  DurableIdentityWriter,
} from './durable-contract';
export type { DurableIdentityModule as Identity } from './durable-contract';
export { createIdentity, type CreateIdentityOptions } from './factory';

// --- Errors a caller must handle -----------------------------------------------------------

export {
  AlreadyConfirmedError,
  ConcurrencyError,
  DanglingRelationError,
  IncompleteReviewError,
  ProposalNotFoundError,
  UnknownProposalItemError,
} from './review';

export { InvalidCorrectionError, NodeNotFoundError } from './correction';

export {
  PersonNotFoundError,
  SourceTooLargeError,
  MissingPdfTextError,
  UnsupportedSourceError,
  SUPPORTED_CONTENT_TYPES,
} from './source-capture';

export { InvalidStatedContextError } from './stated-context';

// --- Inputs and results ---------------------------------------------------------------------

export type {
  ConfirmReviewInput,
  ConfirmReviewResult,
  ItemEdit,
  ReviewDecisionInput,
  SupplementInput,
} from './review';

export type { AddNodeInput, CorrectNodeInput, CorrectionResult } from './correction';
export type { CaptureSourceInput, CaptureSourceResult } from './source-capture';
export type { SetStatedContextInput, UserConditionInput } from './stated-context';

// --- The model a consumer reads ---------------------------------------------------------------

export type {
  // Durable Identity: D = (E, X). PCI is Memory / PCI's, not a component here (ADR 0030).
  DurableIdentity,
  ExplicitState,
  ReconstructedState,
  StatedContext,
  UserCondition,
  UserConditionKind,
  // R = (Structure, Activity, Relations)
  ActivityNode,
  ExplicitNode,
  RelationEdge,
  RelationKind,
  StructureKind,
  StructureNode,
  EpistemicStatus,
  // Person and sources
  Person,
  ProfessionalSource,
  SourceKind,
  SourceLifecycle,
  SourceVisibility,
  // Reconstruction drafts
  DeltaAnnotation,
  DeltaClassification,
  FieldDelta,
  ProposedActivity,
  ProposedConflict,
  ProposedRelation,
  ProposedStructure,
  ReconstructionJob,
  ReconstructionJobStatus,
  ReconstructionProposal,
  ReconstructionProposalContent,
  ReconstructionTrigger,
  SourceReference,
  // History and provenance
  CorrectionRecord,
  ProvenanceRecord,
  ReviewDecisionKind,
  ReviewDecisionRecord,
  ReviewRecord,
  // The Permanent Identity View
  EvidenceEntry,
  PermanentIdentityView,
  SkillEntry,
  ViewEntry,
} from './model';
export { USER_CONDITION_KINDS } from './model';

// --- Identity Representation: persistent, reusable, non-canonical (ADR 0014) -------------------
//
// `V_i = P_i(E_t)`. A named lens the person keeps — distinct from Adaptation's temporary,
// opportunity-specific contextual representation.


// `P_i` — the optional positioning prior Adaptation consumes (ADR 0016). Carries preferences keyed
// by canonical node id and no professional evidence, so it can never stand in for Durable Identity.

// --- Profile Units: the canonical unit of professional truth (ADR 0031) -------------------------

export type { ProfileUnit, ProfileUnitContext, ProfileUnitsView } from './profile-unit';
