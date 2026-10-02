/** Application's public interface — the whole of what another module may do with an Application. */

import type {
  AdaptationProduced,
  ApplicationRecord,
  Communication,
  CommunicationDirection,
  InteractionHistory,
  InterviewStage,
  InterviewStageKind,
  OpportunityStateUsed,
  ApplicationOutcomeType,
  OutcomeKind,
  PersonStateUsed,
  RepresentationPriorUsed,
  SubmittedMaterialKind,
  TimelineStage,
} from './model';
import type { ResolvedApplicationEvidence } from './resolved-evidence';

export interface CreateApplicationInput {
  readonly personId: string;
  readonly opportunityId: string;
  readonly personState: PersonStateUsed;
  readonly opportunityState: OpportunityStateUsed;
  readonly representation?: RepresentationPriorUsed;
  readonly adaptation?: AdaptationProduced;
  readonly createdBy: string;
}

export interface RecordExternalApplicationInput {
  readonly personId: string;
  readonly company: string;
  readonly role: string;
  readonly stage: TimelineStage;
  readonly occurredAt?: string;
  /** Client-generated UUID, reused on retries of the same entry. */
  readonly requestId: string;
}
export class InvalidApplicationInputError extends Error {}

export interface RecordSubmissionInput {
  readonly applicationId: string;
  readonly materials: readonly {
    readonly kind: SubmittedMaterialKind;
    readonly content?: string;
    readonly sourceDraftId?: string;
    readonly editedFromSource?: boolean;
  }[];
  readonly submittedAt: string;
  readonly recordedBy: string;
}

export interface AppendTimelineInput {
  readonly applicationId: string;
  readonly stage: TimelineStage;
  readonly occurredAt: string;
  readonly note?: string;
  /** The entry this corrects. The corrected entry is kept, never deleted. */
  readonly supersedes?: string;
  readonly recordedBy: string;
}

export interface RecordCommunicationInput {
  readonly applicationId: string;
  readonly direction: CommunicationDirection;
  readonly channel: string;
  readonly summary: string;
  readonly occurredAt: string;
}

export interface RecordInterviewStageInput {
  readonly applicationId: string;
  readonly kind: InterviewStageKind;
  readonly occurredAt?: string;
  readonly observations: readonly string[];
}

export interface RecordOutcomeInput {
  readonly applicationId: string;
  readonly kind: OutcomeKind | ApplicationOutcomeType;
  readonly occurredAt: string;
  readonly note?: string;
  readonly feedback?: string;
}

export class ApplicationNotFoundError extends Error {
  constructor(applicationId: string) {
    super(`No application '${applicationId}'.`);
    this.name = 'ApplicationNotFoundError';
  }
}

export class ApplicationAlreadyExistsError extends Error {
  constructor(personId: string, opportunityId: string) {
    super(`An application already exists for person '${personId}' and opportunity '${opportunityId}'.`);
    this.name = 'ApplicationAlreadyExistsError';
  }
}

export class InterviewStageNotFoundError extends Error {
  constructor(stageId: string) {
    super(`No interview stage '${stageId}'.`);
    this.name = 'InterviewStageNotFoundError';
  }
}

export class InvalidApplicationOutcomeError extends Error {
  constructor(kind: string) {
    super(`Unsupported application outcome '${kind}'.`);
    this.name = 'InvalidApplicationOutcomeError';
  }
}

export interface ApplicationModule {
  recordExternalApplication(input: RecordExternalApplicationInput): Promise<ApplicationRecord>;
  recordOwnedProgress(input: { personId: string; applicationId: string; stage: TimelineStage; occurredAt?: string }): Promise<ApplicationRecord>;
  /** Authenticated debrief entry point. Actual-round observations remain Application-owned facts. */
  recordOwnedInterviewStage(input: RecordInterviewStageInput & { readonly personId: string }): Promise<ApplicationRecord>;
  /** Authenticated attachment of the person's own post-interview reflection. */
  attachOwnedInterviewReflection(input: { readonly personId: string; readonly applicationId: string; readonly stageId: string; readonly reflection: string }): Promise<ApplicationRecord>;
  /** Opens one Application, recording Pₙ, Wₙ and — where already known — Rₙ and Aₙ. */
  createApplication(input: CreateApplicationInput): Promise<ApplicationRecord>;

  getApplication(applicationId: string): Promise<ApplicationRecord | undefined>;
  findApplication(personId: string, opportunityId: string): Promise<ApplicationRecord | undefined>;
  listApplications(personId: string): Promise<readonly ApplicationRecord[]>;

  /** Xₙ. Immutable once recorded — a later correction is new material, not an edit of this. */
  recordSubmission(input: RecordSubmissionInput): Promise<ApplicationRecord>;

  /** Iₙ — lifecycle. Append-only; `currentState` is derived, never passed in. */
  appendTimelineEntry(input: AppendTimelineInput): Promise<ApplicationRecord>;
  /** Iₙ — communication. */
  recordCommunication(input: RecordCommunicationInput): Promise<ApplicationRecord>;
  /** Iₙ — interview stage: the observation. Reflection is attached afterwards, by the person. */
  recordInterviewStage(input: RecordInterviewStageInput): Promise<ApplicationRecord>;
  attachInterviewReflection(input: {
    readonly stageId: string;
    readonly reflection: string;
  }): Promise<ApplicationRecord>;

  /** Yₙ. Deliberately separate from Xₙ: how the world responded, not what was sent. */
  recordOutcome(input: RecordOutcomeInput): Promise<ApplicationRecord>;

  /**
   * The resolved-evidence projection — Application's only output toward learning.
   *
   * `undefined` until the application has reached a resolved outcome. No learning happens here;
   * this is the seam Memory / PCI consumes, and only meaningful signals cross it.
   */
  getResolvedEvidence(applicationId: string): Promise<ResolvedApplicationEvidence | undefined>;
}

export type { ApplicationRecord, InteractionHistory };
