/**
 * Public interface of Execution inside the Translation Service (ADR 0031).
 *
 * **Application Session** is Execution's first real behaviour: the temporary runtime state for one
 * application attempt — job/company/portal context, working application state, current execution
 * level, unresolved requirements, session memory — restart-safe because it is persisted, and
 * deliberately kept apart from Application's durable history (no `application*` table is written or
 * read here).
 *
 * **Surface interpretation** is the second: Joby can inspect an arbitrary application page and
 * determine what that surface requires (ADR 0035). A page's controls are compacted into an
 * `ExecutionSurface`, sent to a `SurfaceInterpreter` exactly once alongside session context,
 * validated against the surface actually sent, and the result — known / generated-answer /
 * user-required requirements and mechanical portal operations, plus anything that could not be
 * classified — is recorded onto the session. No ATS-specific branching exists anywhere in this path.
 *
 * **Surface resolution and deterministic execution** are the third and fourth (ADR 0036). Execution
 * asks Joby for exactly the information a requirement needs through its own narrow `JobyQueryPort` —
 * it never orchestrates Identity/Adaptation/Opportunity/Application's authority graph itself.
 * Anything Joby cannot resolve safely becomes a user clarification and pauses the session; it never
 * becomes a guess. What Joby does resolve is turned into a deterministic action plan (fill/select/
 * check/upload only — no submission), executed through a `PortalActionExecutor`, then checked against
 * a fresh observation. Every mechanical outcome lands in Session Memory, never in an Application
 * table.
 *
 * **The recursive execution loop** ties the three together (ADR 0037): `step` does one Observe →
 * Ground → Act → QueryJoby-if-needed → QueryUser-if-unresolved → Verify pass over one observed
 * surface — one Claude call per surface — and returns a structured outcome (`continue`,
 * `waiting_for_user`, `needs_repair`, `submission_ready`, `blocked`) telling the caller what to do
 * next. It does not drive a browser or recurse on its own; a real loop calls `step` repeatedly with
 * whatever the browser shows after each step.
 *
 * Submission orchestration and live browser wiring remain unimplemented.
 */

export { createApplicationSessionModule } from './session-factory';
export type { ApplicationSessionModule } from './session-contract';
export {
  RequirementNotFoundError,
  SessionAlreadySubmittedError,
  SessionNotFoundError,
} from './session-contract';
export type {
  AddRequirementsInput,
  CreateOrResumeSessionInput,
  NewSessionRequirement,
  RecordSessionNoteInput,
  ResolveRequirementInput,
  SetExecutionLevelInput,
  UpdatePortalContextInput,
  UpdateWorkingStateInput,
} from './session-contract';

export { EXECUTION_LEVELS, SURFACE_REQUIREMENT_KINDS, deriveSubmissionReadiness } from './session';
export type {
  ApplicationSession,
  ExecutionLevel,
  JobContext,
  PortalContext,
  RequirementStatus,
  SessionMemory,
  SessionRequirement,
  SubmissionReadiness,
  SurfaceRequirementKind,
  WorkingApplicationState,
} from './session';

export type { ApplicationIntent, FastFeedback } from './information-seams';

/**
 * **Page surface interpretation** — Joby can inspect an arbitrary application page and determine
 * what that surface requires. `Browser → Portal Context → Execution Surface → Claude → Semantic
 * requirements → Working Application State`. See the `surface-*` files in this module.
 */
export { createSurfaceInspectionModule } from './surface-factory';
export type { SurfaceInspectionModule } from './surface-contract';
export type {
  RecordedSurfaceRequirement,
  SurfaceInspectionInput,
  SurfaceInspectionResult,
} from './surface-contract';

export { buildExecutionSurface } from './surface-observation';
export type {
  ExecutionSurface,
  ExecutionSurfaceElement,
  PageObservation,
  PageObservationElement,
  SurfaceElementKind,
} from './surface-observation';

export { SurfaceInterpretationError } from './surface-port';
export type {
  SurfaceInterpretationContext,
  SurfaceInterpretationOutput,
  SurfaceInterpretationRequest,
  SurfaceInterpretationResult,
  SurfaceInterpreter,
  SurfaceRequirement,
  UnclearSurfaceElement,
} from './surface-port';

export { DeterministicSurfaceInterpreter } from './surface-deterministic-interpreter';
export { ClaudeSurfaceInterpreter } from './surface-claude-interpreter';
export type { ClaudeSurfaceInterpreterOptions } from './surface-claude-interpreter';

/**
 * **Surface resolution** — Execution asks Joby for exactly what a requirement needs; Joby answers or
 * says it cannot resolve safely (ADR 0036).
 */
export { DeterministicJobyQueryPort, createSurfaceResolutionModule } from './surface-resolution';
export type {
  JobyQuery,
  JobyQueryPort,
  JobyQueryResult,
  JobyQuerySource,
  RequirementResolutionOutcome,
  ResolveSessionRequirementsInput,
  SurfaceResolutionModule,
  SurfaceResolutionResult,
} from './surface-resolution';

export { CompositeJobyQueryPort } from './joby-query-adapter';
export type { JobyRequirementResolver } from './joby-query-adapter';

/**
 * **Deterministic action execution** — a resolved surface becomes mechanical fill/select/check/
 * upload actions, executed, then checked against a fresh observation (ADR 0036).
 */
export { DeterministicPortalActionExecutor, buildActionPlan, createSurfaceExecutionModule } from './surface-execution';
export type {
  ActionValidationMismatch,
  ExecuteSurfaceActionsInput,
  PortalAction,
  PortalActionExecutor,
  PortalActionOutcome,
  PortalActionType,
  SurfaceExecutionModule,
  SurfaceExecutionResult,
} from './surface-execution';

/**
 * **The recursive execution loop** — Observe → Ground → Act → QueryJoby if needed → QueryUser if
 * unresolved → Verify → Repeat, one step per execution surface (ADR 0037).
 */
export { createSurfaceLoopModule } from './surface-loop';
export type { ExecutionStepOutcome, RunExecutionStepInput, SurfaceLoopModule } from './surface-loop';

export { BrowserApplicationAutomationRunner, createApplicationAutomationRunner } from './automation-runner';
export type {
  ApplicationAutomationOutcome,
  ApplicationAutomationRunner,
  AutomationPageObserver,
  AutomationSubmitResult,
  AutomationSubmitter,
  RunApplicationAutomationInput,
} from './automation-runner';
