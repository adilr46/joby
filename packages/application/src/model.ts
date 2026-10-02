/**
 * Application: the durable structured observation of one Person × Opportunity interaction.
 *
 * ```text
 * Oₙ = (Pₙ, Wₙ, Rₙ, Aₙ, Xₙ, Iₙ, Yₙ)
 * ```
 *
 * Seven epistemically distinct parts, and the whole design is keeping them apart:
 *
 * | | Meaning | Recorded, never re-derived from a live authority |
 * |---|---|---|
 * | `Pₙ` | Person state used | which grounding evidence and identity revision this application was built against |
 * | `Wₙ` | Opportunity / world state used | which opportunity revision |
 * | `Rₙ` | Representation prior used | recommended vs selected, and whether the person overrode Router |
 * | `Aₙ` | Adaptation produced | a reference to what Adaptation composed |
 * | `Xₙ` | Submitted reality | what was actually sent — **may differ from `Aₙ`** |
 * | `Iₙ` | Interaction history | lifecycle timeline, communications, interviews |
 * | `Yₙ` | Resolved outcome | how the external world responded — **distinct from `Xₙ`** |
 *
 * **Application owns none of the domains these reference.** Every field below is an identifier, a
 * revision number, or a copy of material that crossed an external boundary (`Xₙ`) — never a live
 * projection of Identity, Representation, Opportunity or Adaptation state. `Pₙ`/`Wₙ`/`Rₙ`/`Aₙ`
 * preserve *lineage*: enough to say what this application was built from, never enough to reconstruct
 * or supersede the authority that produced it.
 */

// --- Root -------------------------------------------------------------------------------------

export interface Application {
  /** User-reported labels for an uncaptured external opportunity; never an inferred understanding. */
  readonly externalDetails?: { readonly company: string; readonly role: string };
  readonly id: string;
  readonly personId: string;
  /** Opportunity's identifier. Application never becomes a second opportunity store. */
  readonly opportunityId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// --- Pₙ — Person state used ---------------------------------------------------------------------

/**
 * What Identity evidence this application was built from.
 *
 * References, not copies. `groundingProfileUnitIds` names which canonical units the submitted
 * material actually cites — the same traceability rule extraction and understanding already hold
 * claims to — and `identityRevision` is which reading of Durable Identity this was against, so a
 * later correction does not silently rewrite what an already-submitted application was grounded in.
 */
export interface PersonStateUsed {
  readonly groundingProfileUnitIds: readonly string[];
  readonly identityRevision: number | null;
  /** The person's own stated conditions/preferences relied upon, verbatim, not re-read live. */
  readonly userContextUsed?: {
    readonly conditions?: Partial<Record<string, readonly string[]>>;
    readonly constraints?: readonly string[];
    readonly preferences?: readonly string[];
    readonly careerDirection?: string;
  };
}

// --- Wₙ — Opportunity / world state used ---------------------------------------------------------

/** Which reading of the external situation this application was built from. */
export interface OpportunityStateUsed {
  readonly opportunityId: string;
  readonly opportunityRevision: number | null;
}

// --- Rₙ — Representation prior used ---------------------------------------------------------------

/**
 * What Router recommended, what was actually used, and whether they differ.
 *
 * `overridden` is derived from the other two rather than stored redundantly — see
 * {@link representationOverridden}. Both ids may be absent: a person may apply outside every
 * Representation they keep, which is a supported case, not a degraded one.
 */
export interface RepresentationPriorUsed {
  readonly recommendedRepresentationId?: string;
  readonly selectedRepresentationId?: string;
  readonly representationRevision?: number;
}

export function representationOverridden(prior: RepresentationPriorUsed): boolean {
  return (
    prior.recommendedRepresentationId !== undefined &&
    prior.selectedRepresentationId !== undefined &&
    prior.recommendedRepresentationId !== prior.selectedRepresentationId
  );
}

// --- Aₙ — Adaptation produced ---------------------------------------------------------------------

/**
 * A reference to what Adaptation composed, not a copy of it.
 *
 * Adapted State is composed on request and stored nowhere (ADR 0013); Application does not change
 * that by holding a second copy. What it keeps is enough to say *which* composition this application
 * drew from and *which* drafts it drew from, so the lineage is reconstructible without Application
 * ever owning Adaptation's state.
 */
export interface AdaptationProduced {
  readonly adaptationContextId?: string;
  /** Representation drafts consulted, by id — Adaptation's records, referenced, not duplicated. */
  readonly draftIds: readonly string[];
}

// --- Xₙ — Submitted reality --------------------------------------------------------------------

export type SubmittedMaterialKind = 'cv' | 'answer' | 'cover_letter' | 'document';

/**
 * One piece of material that actually crossed the external boundary.
 *
 * **This is `Xₙ`, and it is deliberately not `Aₙ`.** What Joby produced and what the person actually
 * sent can differ — an edit, a swapped attachment, a question answered differently at the last
 * moment — and only this reflects the external world's view of the interaction. `sourceDraftId`
 * traces back to `Aₙ` *when* the sent text came from a draft; its absence is itself informative: this
 * material did not originate from anything Joby produced.
 */
export interface SubmittedMaterial {
  readonly id: string;
  readonly kind: SubmittedMaterialKind;
  /** The exact text or claim as sent, when the material is text. */
  readonly content?: string;
  /** Absent when this material did not originate from an Adaptation draft. */
  readonly sourceDraftId?: string;
  /** Whether the sent content differs from the draft it came from. Always false with no source. */
  readonly editedFromSource: boolean;
}

export interface SubmittedReality {
  readonly materials: readonly SubmittedMaterial[];
  readonly submittedAt: string;
}

// --- Iₙ — Interaction history --------------------------------------------------------------------

/**
 * The closed set of lifecycle stages a timeline entry may record.
 *
 * Open enough to admit a full application cycle, closed enough that "current stage" stays a small,
 * displayable thing rather than free text nobody can build a view on.
 */
export const TIMELINE_STAGES = [
  'drafting',
  'submitted',
  'under_review',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type TimelineStage = (typeof TIMELINE_STAGES)[number];

/**
 * One dated fact about the application's progress.
 *
 * **Append-only.** History is never edited in place — a correction is a later entry, `supersedes`ing
 * the one it corrects, so what was believed at the time remains inspectable. `currentState` is never
 * stored; it is the chronologically latest entry, derived on every read (see `deriveCurrentState`).
 */
export interface TimelineEntry {
  readonly id: string;
  readonly stage: TimelineStage;
  readonly occurredAt: string;
  readonly note?: string;
  /** The entry this one corrects, if any. The superseded entry is kept, not deleted. */
  readonly supersedes?: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

export type CommunicationDirection = 'inbound' | 'outbound';

/** A meaningful exchange with the employer or recruiter. Not a message-log mirror. */
export interface Communication {
  readonly id: string;
  readonly direction: CommunicationDirection;
  readonly channel: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

export const INTERVIEW_STAGE_KINDS = [
  'phone',
  'video',
  'in_person',
  'assessment_centre',
  'take_home',
] as const;

export type InterviewStageKind = (typeof INTERVIEW_STAGE_KINDS)[number];

/**
 * One interview stage: what actually happened, and what the person made of it afterwards.
 *
 * `observations` and `reflection` are kept apart deliberately. An observation is a fact about the
 * stage — who, when, what was asked. A reflection is the person's own read of how it went, and it is
 * *their* interpretation, not a system judgement — nothing here scores a performance.
 */
export interface InterviewStage {
  readonly id: string;
  readonly kind: InterviewStageKind;
  readonly occurredAt?: string;
  /** Factual observations about the stage: format, participants, questions actually asked. */
  readonly observations: readonly string[];
  /** The person's own account afterwards, in their own words. Never a system-generated score. */
  readonly reflection?: string;
  readonly recordedAt: string;
}

export interface InteractionHistory {
  readonly timeline: readonly TimelineEntry[];
  readonly communications: readonly Communication[];
  readonly interviewStages: readonly InterviewStage[];
}

/**
 * The application's current stage, derived from timeline chronology.
 *
 * **Never independently stored.** A stage column beside the timeline is a second place the same fact
 * could disagree with itself; this function is the only source of "current state" there is.
 * Entries that have been superseded are excluded, so a correction genuinely replaces what it
 * corrects rather than merely appending a second opinion.
 */
export function deriveCurrentState(timeline: readonly TimelineEntry[]): TimelineStage | undefined {
  const superseded = new Set(
    timeline.map((entry) => entry.supersedes).filter((id): id is string => id !== undefined),
  );
  const active = timeline.filter((entry) => !superseded.has(entry.id));
  if (active.length === 0) return undefined;

  const latest = [...active].sort((a, b) => {
    const byOccurrence = a.occurredAt.localeCompare(b.occurredAt);
    // Same instant: the one recorded later is the more current belief.
    return byOccurrence !== 0 ? byOccurrence : a.recordedAt.localeCompare(b.recordedAt);
  });
  return latest.at(-1)!.stage;
}

// --- Yₙ — Resolved outcome -----------------------------------------------------------------------

export const OUTCOME_KINDS = ['progressed', 'offer', 'rejection', 'withdrawn', 'no_response'] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

/**
 * Canonical outcome meaning, separate from the coarse world-response kind stored on Y_n.
 *
 * The distinction mirrors the old career-ops lesson: tracker/application state is not outcome
 * meaning. `offer_declined` and `no_response` may both end a process, but they are different
 * signals for future strategy.
 */
export const APPLICATION_OUTCOME_TYPES = [
  'interview_progress',
  'interview_only',
  'offer_received',
  'hired',
  'offer_declined',
  'rejected',
  'no_response',
] as const;

export type ApplicationOutcomeType = (typeof APPLICATION_OUTCOME_TYPES)[number];

const OUTCOME_ALIASES: Record<string, ApplicationOutcomeType> = {
  stage_reached: 'interview_progress',
  interview: 'interview_progress',
  offer: 'offer_received',
  accepted: 'hired',
  declined: 'offer_declined',
  rejection: 'rejected',
  ghosted: 'no_response',
};

export function canonicalApplicationOutcome(raw: unknown): ApplicationOutcomeType | undefined {
  const key = String(raw ?? '').trim().toLowerCase().replace(/-/g, '_');
  if ((APPLICATION_OUTCOME_TYPES as readonly string[]).includes(key)) {
    return key as ApplicationOutcomeType;
  }
  return OUTCOME_ALIASES[key];
}

export function outcomeKindFor(type: ApplicationOutcomeType): OutcomeKind {
  switch (type) {
    case 'interview_progress':
    case 'interview_only':
      return 'progressed';
    case 'offer_received':
    case 'hired':
      return 'offer';
    case 'offer_declined':
      return 'withdrawn';
    case 'rejected':
      return 'rejection';
    case 'no_response':
      return 'no_response';
  }
}

export interface OutcomeProgression {
  readonly reachedInterview: boolean;
  readonly reachedOffer: boolean;
  readonly terminal: boolean;
  readonly terminalPolarity?: 'positive' | 'negative' | 'neutral';
}

export function classifyApplicationOutcome(type: ApplicationOutcomeType): OutcomeProgression {
  switch (type) {
    case 'interview_progress':
      return { reachedInterview: true, reachedOffer: false, terminal: false };
    case 'interview_only':
      return {
        reachedInterview: true,
        reachedOffer: false,
        terminal: true,
        terminalPolarity: 'neutral',
      };
    case 'offer_received':
    case 'hired':
      return {
        reachedInterview: true,
        reachedOffer: true,
        terminal: true,
        terminalPolarity: 'positive',
      };
    case 'offer_declined':
      return {
        reachedInterview: true,
        reachedOffer: true,
        terminal: true,
        terminalPolarity: 'neutral',
      };
    case 'rejected':
    case 'no_response':
      return {
        reachedInterview: false,
        reachedOffer: false,
        terminal: true,
        terminalPolarity: 'negative',
      };
  }
}

export function classifyOutcomeKind(kind: OutcomeKind): OutcomeProgression {
  switch (kind) {
    case 'progressed':
      return { reachedInterview: true, reachedOffer: false, terminal: false };
    case 'offer':
      return {
        reachedInterview: true,
        reachedOffer: true,
        terminal: true,
        terminalPolarity: 'positive',
      };
    case 'withdrawn':
      return {
        reachedInterview: false,
        reachedOffer: false,
        terminal: true,
        terminalPolarity: 'neutral',
      };
    case 'rejection':
    case 'no_response':
      return {
        reachedInterview: false,
        reachedOffer: false,
        terminal: true,
        terminalPolarity: 'negative',
      };
  }
}

/**
 * A factual observation of how the external world responded.
 *
 * **This is `Yₙ`, and it is deliberately not `Xₙ`.** What was sent is a fact about the person's
 * action; how the world responded is a fact about the world, observed later and often not caused by
 * anything in `Xₙ` alone — a placement outcome is dominated by headcount, timing, an internal
 * candidate, none of which the material sent had anything to do with. Recording them separately is
 * what stops a later reader from reading causation into two facts that merely happened in sequence.
 */
export interface ResolvedOutcome {
  readonly id: string;
  readonly kind: OutcomeKind;
  /** More precise canonical meaning when known, preserving aliases at the boundary. */
  readonly canonicalType?: ApplicationOutcomeType;
  readonly occurredAt: string;
  readonly note?: string;
  /** Verbatim recruiter/interviewer feedback, never paraphrased by Application. */
  readonly feedback?: string;
  readonly recordedAt: string;
}

// --- The aggregate ---------------------------------------------------------------------------------

export interface ApplicationRecord {
  readonly application: Application;
  readonly personState: PersonStateUsed;
  readonly opportunityState: OpportunityStateUsed;
  readonly representation: RepresentationPriorUsed;
  readonly adaptation: AdaptationProduced;
  readonly submitted?: SubmittedReality;
  readonly interaction: InteractionHistory;
  readonly outcomes: readonly ResolvedOutcome[];
}

/** The application's current stage, computed from its timeline. Not stored. */
export function currentState(record: ApplicationRecord): TimelineStage | undefined {
  return deriveCurrentState(record.interaction.timeline);
}
