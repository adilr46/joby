/** Execution's public interface for Application Sessions — the whole of what another module may do. */

import type { ApplicationIntent } from './information-seams';
import type {
  ApplicationSession,
  ExecutionLevel,
  RequirementStatus,
  SubmissionReadiness,
  SurfaceRequirementKind,
} from './session';

export interface CreateOrResumeSessionInput {
  readonly personId: string;
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  readonly role?: string;
  readonly company?: string;
  readonly applicationId?: string;
  /** The attempt's starting checklist. Empty is valid — nothing yet known to be unresolved. */
  readonly requirements?: readonly { readonly id: string; readonly label: string }[];
}

export interface UpdatePortalContextInput {
  readonly sessionId: string;
  readonly portalKind?: string;
  readonly currentStepId?: string;
}

export interface UpdateWorkingStateInput {
  readonly sessionId: string;
  readonly intent?: ApplicationIntent;
  readonly portalFieldValues?: Partial<Record<string, string>>;
}

export interface SetExecutionLevelInput {
  readonly sessionId: string;
  readonly level: ExecutionLevel;
}

export interface ResolveRequirementInput {
  readonly sessionId: string;
  readonly requirementId: string;
  readonly status: RequirementStatus;
  readonly resolvedValue?: string;
}

export interface RecordSessionNoteInput {
  readonly sessionId: string;
  readonly note?: string;
  readonly lastAction?: string;
  readonly nextStep?: string;
}

/** One newly discovered requirement — a checklist entry, not the answer itself. */
export interface NewSessionRequirement {
  readonly id: string;
  readonly label: string;
  readonly status?: RequirementStatus;
  readonly resolvedValue?: string;
  readonly kind?: SurfaceRequirementKind;
  readonly surfaceElementId?: string;
}

export interface AddRequirementsInput {
  readonly sessionId: string;
  readonly requirements: readonly NewSessionRequirement[];
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`No application session '${sessionId}'.`);
    this.name = 'SessionNotFoundError';
  }
}

export class RequirementNotFoundError extends Error {
  constructor(requirementId: string) {
    super(`No requirement '${requirementId}' on this session.`);
    this.name = 'RequirementNotFoundError';
  }
}

export class SessionAlreadySubmittedError extends Error {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' has already reached 'submitted' and cannot be changed.`);
    this.name = 'SessionAlreadySubmittedError';
  }
}

export interface ApplicationSessionModule {
  /**
   * Create a session for this person and opportunity, or return the existing one unchanged.
   *
   * "Resume" here means exactly that: an existing session for this (person, opportunity) pair is
   * returned as-is, never reset. Creating and resuming are one operation because the caller should
   * not have to know in advance which case applies — the person choosing to continue an application
   * looks identical whether or not one was already open.
   */
  createOrResumeSession(input: CreateOrResumeSessionInput): Promise<ApplicationSession>;

  getSession(sessionId: string): Promise<ApplicationSession | undefined>;
  findSession(personId: string, opportunityId: string): Promise<ApplicationSession | undefined>;
  listSessions(personId: string): Promise<readonly ApplicationSession[]>;

  updatePortalContext(input: UpdatePortalContextInput): Promise<ApplicationSession>;
  updateWorkingState(input: UpdateWorkingStateInput): Promise<ApplicationSession>;
  setExecutionLevel(input: SetExecutionLevelInput): Promise<ApplicationSession>;
  resolveRequirement(input: ResolveRequirementInput): Promise<ApplicationSession>;
  /**
   * Append newly discovered requirements. Entries whose `id` already exists on the session are
   * silently skipped — rediscovering the same portal field is not a second requirement, and this
   * keeps the call safe to make more than once against the same surface.
   */
  addRequirements(input: AddRequirementsInput): Promise<ApplicationSession>;
  recordSessionNote(input: RecordSessionNoteInput): Promise<ApplicationSession>;

  /** Suspend work safely. Every other field is untouched; only `paused` changes. */
  pauseSession(sessionId: string): Promise<ApplicationSession>;
  /** Resume exactly where the session left off. Nothing is recomputed. */
  resumeSession(sessionId: string): Promise<ApplicationSession>;

  /** Derived, not stored — see `deriveSubmissionReadiness`. */
  getSubmissionReadiness(sessionId: string): Promise<SubmissionReadiness>;
}
