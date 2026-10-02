/**
 * Typed payloads, one per event name.
 *
 * Rules these payloads follow, from ADR 0002:
 *  - JSON-serialisable only.
 *  - Identifiers, not object graphs. Handlers re-read state from the owning domain.
 *  - Enough context to decide *whether* to act, never enough to avoid asking the owner.
 *
 * Shapes are intentionally minimal. Fields get added when a subscriber genuinely needs them,
 * not in anticipation.
 */

/** Observed, Inferred and Hypothesized stay distinct. They never collapse into each other. */
export type EpistemicStatus = 'observed' | 'inferred' | 'hypothesized';

export interface IdentityUpdatedPayload {
  /** The Durable Identity Explicit State record that changed. Never a representation. */
  readonly identityId: string;
  /** Names of the canonical fields that changed. Values are not carried. */
  readonly changedFields: readonly string[];
  /** Monotonic revision of the Explicit State record after the change. */
  readonly revision: number;
  /**
   * True when a human accepted the change. AI never silently modifies Explicit State,
   * so an update originating from AI output is only ever published once confirmed.
   */
  readonly userConfirmed: boolean;
}

/** A canonical fact ceased to be operative; consumers reconcile their own ID references. */
export interface CanonicalFactRemovedPayload {
  readonly identityId: string;
  readonly nodeId: string;
  readonly revision: number;
}

/** A persistent, context-independent lens changed its own positioning state. */
export interface IdentityRepresentationRevisedPayload {
  readonly representationId: string;
  readonly revision: number;
  readonly changedFields: readonly ('decisions' | 'themes')[];
}

export interface EvidenceConfirmedPayload {
  readonly evidenceItemId: string;
  /** Claims that now have this evidence backing them. */
  readonly claimIds: readonly string[];
  /** Confirmed evidence is observed by definition; carried explicitly so subscribers never assume. */
  readonly epistemicStatus: Extract<EpistemicStatus, 'observed'>;
  readonly confirmedByUserId: string;
}

export interface OpportunityImportedPayload {
  readonly opportunityId: string;
  /** Where it came from, e.g. a portal or feed identifier. */
  readonly source: string;
  /** The source's own identifier, for deduplication by the owning domain. */
  readonly externalRef?: string;
  /** True if this import matched an opportunity Discovery already held. */
  readonly isDuplicate: boolean;
}

export interface ApplicationSubmittedPayload {
  /** The immutable record of what was actually submitted. */
  readonly applicationRecordId: string;
  readonly opportunityId: string;
  /** The representation submitted when one was used — a derived rendering, never Explicit State. */
  readonly representationId?: string;
}

export interface InterviewRecordedPayload {
  readonly interviewId: string;
  /** Present when the interview belongs to a tracked application. */
  readonly applicationRecordId?: string;
  readonly format: 'phone' | 'video' | 'in_person' | 'assessment_centre' | 'take_home';
}

export interface OutcomeObservedPayload {
  readonly subject: { readonly kind: 'application' | 'interview'; readonly id: string };
  readonly outcome: 'progressed' | 'offer' | 'rejection' | 'withdrawn' | 'no_response';
  /** How Joby learned of the outcome. Observed outcomes are the compounding substrate of Memory. */
  readonly observedVia: 'user_reported' | 'email' | 'portal';
}

/** The map that gives `event.payload` its type from `event.name`. */
export interface EventPayloads {
  IdentityUpdated: IdentityUpdatedPayload;
  CanonicalFactRemoved: CanonicalFactRemovedPayload;
  IdentityRepresentationRevised: IdentityRepresentationRevisedPayload;
  EvidenceConfirmed: EvidenceConfirmedPayload;
  OpportunityImported: OpportunityImportedPayload;
  ApplicationSubmitted: ApplicationSubmittedPayload;
  InterviewRecorded: InterviewRecordedPayload;
  OutcomeObserved: OutcomeObservedPayload;
}
