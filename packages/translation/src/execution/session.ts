/**
 * **Application Session** — Execution's temporary runtime state for one application attempt.
 *
 * ```text
 * Execution   = what Joby attempts.
 * Application = what is actually happening and what actually happened.
 * ```
 *
 * A session is the *attempting* half of that split, made durable enough to survive a restart. It
 * holds the operational surface Execution needs while working an attempt — which portal, which
 * field, what is still unresolved, whether it is safe to submit — and **nothing** that belongs to
 * Application's history. No browser or model execution happens here; this is state, not action.
 *
 * **This is not `Xₙ`.** `Xₙ` is what actually crossed the external boundary, immutable once
 * recorded, owned by Application. A session's `workingState` is what Execution currently *intends*
 * to submit — provisional, mutable, and thrown away or superseded freely right up until the moment
 * something is actually sent. Submitting is the act that turns a session's working state into
 * Application's `Xₙ`; that act is deliberately not implemented here (ADR 0031 — Execution "may
 * repair and retry"; the boundary between attempting and having-happened is Application's to cross).
 */

import type { ApplicationIntent } from './information-seams';

// --- Job / Company context ------------------------------------------------------------------------

/**
 * What this attempt is against.
 *
 * A reference and a revision, never a copy of Opportunity's understanding — the same discipline
 * Adaptation Context and Application's `Wₙ` already hold. `role` and `company` are carried for
 * display only, exactly as captured at session creation; a later re-understanding of the opportunity
 * does not reach back and rewrite them.
 *
 * **Company has no owner of its own.** Nothing in Joby resolves a company to a stable entity yet
 * (`@joby/opportunity`'s README lists it as deliberately not built). `company` here is Opportunity's
 * own attributed reading, carried through — not a claim this module makes or a second company store.
 */
export interface JobContext {
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  readonly role?: string;
  readonly company?: string;
}

// --- Portal context ---------------------------------------------------------------------------

/**
 * Where this attempt is within one external portal — navigation, not content.
 *
 * `portalKind` is free text, not a closed vocabulary — `packages/portal` is infrastructure with no
 * semantic authority of its own (ADR 0031), so nothing here should invent a taxonomy it does not
 * own. `currentStepId` is whichever page or step the portal itself uses to identify progress.
 *
 * **Field values live in `WorkingApplicationState`, not here.** A field-mapping keeps this narrowly
 * about *where* the attempt is; what has actually been filled in is what is being worked toward
 * submission, and duplicating it in two places would let them disagree about which value is current.
 */
export interface PortalContext {
  readonly portalKind?: string;
  readonly currentStepId?: string;
}

// --- Working application state --------------------------------------------------------------------

/**
 * What Execution currently intends to submit — provisional, and not yet `Xₙ`.
 *
 * `intent` is Adaptation's own `ApplicationIntent` (the existing Adaptation -> Execution seam),
 * carried here unchanged rather than copied into a new shape. `portalFieldValues` covers anything a
 * portal asks for that Adaptation's intent does not — a portal-only checkbox, a dropdown with no
 * canonical equivalent — kept separate so it is obvious which part of this state came from Adaptation
 * and which part is purely mechanical portal filling.
 */
export interface WorkingApplicationState {
  readonly intent?: ApplicationIntent;
  readonly portalFieldValues: Partial<Record<string, string>>;
}

// --- Current execution level ------------------------------------------------------------------

/**
 * Execution's own notion of progress through one attempt.
 *
 * **Not Application's `currentState`.** Application's timeline records dated facts about the whole
 * interaction — submitted, interviewing, rejected. This is the mechanical surface of *attempting*
 * one submission: has field-mapping started, is it blocked on something unresolved, is it ready. The
 * two vocabularies are deliberately disjoint so neither is tempted to stand in for the other.
 */
export const EXECUTION_LEVELS = [
  'not_started',
  'preparing',
  'awaiting_input',
  'ready_to_submit',
  'submitted',
  'failed',
] as const;

export type ExecutionLevel = (typeof EXECUTION_LEVELS)[number];

// --- Unresolved requirements ---------------------------------------------------------------------

export type RequirementStatus = 'unresolved' | 'resolved' | 'not_applicable';

/**
 * How a requirement was classified when it was discovered from a portal surface (see
 * `execution/surface`) — the vocabulary lives here because `SessionRequirement` owns the field, not
 * because surface interpretation owns the requirement.
 *
 * - `known` — answerable directly from something already known about the person; grounded, never
 *   guessed at.
 * - `generated_answer` — an open question Adaptation could draft an answer for; drafting itself
 *   happens elsewhere, this only flags the requirement as that kind.
 * - `user_required` — must come from the person directly; nothing upstream can answer it.
 * - `portal_operation` — not a content question at all, a mechanical action the portal needs (a
 *   file upload, a consent checkbox, a "Continue" button).
 */
export const SURFACE_REQUIREMENT_KINDS = ['known', 'generated_answer', 'user_required', 'portal_operation'] as const;
export type SurfaceRequirementKind = (typeof SURFACE_REQUIREMENT_KINDS)[number];

/**
 * One thing standing between this attempt and being ready to submit.
 *
 * `resolvedValue` is a short pointer or summary for display — "answered via draft-3", "confirmed
 * right to work" — never the canonical answer itself. The canonical material lives in Adaptation's
 * drafts or in whatever the person typed into the portal; this is a checklist entry, not a second
 * copy of an answer.
 *
 * `kind` and `surfaceElementId` are optional and only present for requirements discovered by surface
 * interpretation — a requirement added any other way has neither, and readiness derivation does not
 * care which is true.
 */
export interface SessionRequirement {
  readonly id: string;
  readonly label: string;
  readonly status: RequirementStatus;
  readonly resolvedValue?: string;
  readonly kind?: SurfaceRequirementKind;
  readonly surfaceElementId?: string;
}

// --- Session memory -----------------------------------------------------------------------------

/**
 * What Execution needs to pick this attempt back up, exactly where it left off.
 *
 * Structured enough to resume against, loose enough not to force a decision this slice does not
 * make about how a future browser/model execution loop actually resumes. `notes` is append-only in
 * intent (the service appends, never rewrites), so an earlier note surviving a pause is not lost the
 * way it would be if this were a single overwritten string.
 */
export interface SessionMemory {
  readonly lastAction?: string;
  readonly nextStep?: string;
  readonly notes: readonly string[];
}

// --- The session ---------------------------------------------------------------------------------

/**
 * One Application Session: the durable, restart-safe, temporary runtime state for one attempt.
 *
 * **Durable but not Application history.** Persisted to survive a restart, which is exactly the
 * property that makes it easy to mistake for Application's own record. It is not: this row can be
 * discarded, restarted or superseded by a later attempt at the same opportunity with no loss to
 * Application's history, because nothing here is a fact about what happened — only about what
 * Execution is currently attempting.
 *
 * `applicationId` is optional and deliberately so: a session may exist before a durable Application
 * does. Linking them is a composition-root decision this slice does not make (ADR 0033 already
 * leaves "when Execution's activity becomes Application-relevant" as an open Tier 1 question).
 */
export interface ApplicationSession {
  readonly id: string;
  readonly personId: string;
  readonly opportunityId: string;
  readonly applicationId?: string;
  readonly jobContext: JobContext;
  readonly portalContext: PortalContext;
  readonly workingState: WorkingApplicationState;
  readonly executionLevel: ExecutionLevel;
  /**
   * Paused sessions keep their `executionLevel` exactly as it was. Pausing suspends work; it does
   * not regress progress, and resuming needs nothing recomputed.
   */
  readonly paused: boolean;
  readonly requirements: readonly SessionRequirement[];
  readonly memory: SessionMemory;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// --- Derived submission readiness --------------------------------------------------------------

export interface SubmissionReadiness {
  readonly ready: boolean;
  /** Every requirement still blocking submission. Empty when `ready` is true. */
  readonly blockedBy: readonly SessionRequirement[];
  readonly reason: string;
}

/**
 * Whether this session is safe to submit — **derived, never stored**, for the same reason
 * Application's `currentState` is derived from its timeline: a stored readiness flag is a second
 * place the same fact could disagree with itself the moment a requirement changes underneath it.
 */
export function deriveSubmissionReadiness(session: ApplicationSession): SubmissionReadiness {
  if (session.paused) {
    return { ready: false, blockedBy: [], reason: 'The session is paused.' };
  }
  if (session.executionLevel === 'submitted') {
    return { ready: false, blockedBy: [], reason: 'This attempt has already been submitted.' };
  }
  if (session.executionLevel === 'failed') {
    return { ready: false, blockedBy: [], reason: 'This attempt failed and needs attention before it can be ready.' };
  }

  const blockedBy = session.requirements.filter((requirement) => requirement.status === 'unresolved');
  if (blockedBy.length > 0) {
    return {
      ready: false,
      blockedBy,
      reason: `${blockedBy.length} requirement${blockedBy.length === 1 ? '' : 's'} still unresolved: ${blockedBy.map((r) => r.label).join(', ')}.`,
    };
  }

  if (!session.workingState.intent) {
    return { ready: false, blockedBy: [], reason: 'No representation has been prepared for submission yet.' };
  }

  return { ready: true, blockedBy: [], reason: 'Every tracked requirement is resolved.' };
}
