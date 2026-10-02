/**
 * Module 1 — Context Interpretation (UC01–UC04).
 *
 *   P_i(E_t) + C_opportunity + C_user  ->  Adaptation Context
 *
 * The temporary state that makes one opportunity **legible** before any professional adaptation
 * happens. Nothing here adapts, selects, scores or ranks: that is Module 2 and, for scoring, another
 * domain entirely.
 *
 * Everything in this file is temporary and context-bounded (ADRs 0012, 0013). None of it is
 * person-state, and none of it may become person-state by being persisted.
 */

import type { StatedContext, UserConditionKind } from '@joby/identity';
import type { RepresentationPrior } from '@joby/identity/representation';

/**
 * UC01 — the temporary scope for one opportunity.
 *
 * References and revisions, never copies: opportunity data and understanding belong to Opportunity,
 * while identity and the lens retain their own owners. The context records *which* of each it was
 * built from, so what it shows can always be traced and rebuilt.
 */
export interface AdaptationContext {
  readonly id: string;
  readonly personId: string;
  /** The lens this adaptation starts from. Optional: `P_i` is optional (ADR 0016). */
  readonly representationId?: string;
  /** Opportunity's identifier. Adaptation never becomes a second opportunity store. */
  readonly opportunityId: string;
  /** The Opportunity Intelligence revision this context was built from. */
  readonly opportunityRevision: number;
  /** The canonical Explicit State revision this context was built from. */
  readonly identityRevision: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

/**
 * UC02 — `RawOpportunity -> C_opportunity`.
 *
 * Opportunity's attributed understanding, arranged for adaptation: what the role asks for, and the
 * conditions it states. **No scoring, ranking or recommendation** — nothing here says whether the
 * person should apply, or how well they match.
 */
export interface OpportunityContext {
  readonly opportunityId: string;
  readonly revision: number;
  /**
   * Absent when the captured evidence never stated it (ADR 0028). Not defaulted to a blank: an
   * empty string reads downstream as a stated blank rather than as "nobody said", and the gap is
   * already named in `uncertainty`.
   */
  readonly role?: string;
  readonly company?: string;
  readonly requiredCapabilities: readonly string[];
  readonly preferredCapabilities: readonly string[];
  readonly responsibilities: readonly string[];
  /** Stated conditions only. An absent kind means the posting did not say. */
  readonly conditions: Partial<Record<UserConditionKind, readonly string[]>>;
  readonly applicationQuestions: readonly string[];
  readonly attribution: readonly string[];
  readonly uncertainty: readonly string[];
}

/**
 * UC03 — `C_user = Retrieve(UserConditions)`.
 *
 * Retrieved from Stated Context, never inferred from the moment. Adaptation does not maintain these
 * and cannot write them: they are canonical person-state the user authored (ADR 0017), and they do
 * not fluctuate from one application to the next.
 */
export interface UserContext {
  readonly personId: string;
  readonly identityRevision: number;
  /** The person's own words, by kind. An absent kind means they have not said. */
  readonly conditions: Partial<Record<UserConditionKind, readonly string[]>>;
  /** Free-text constraints the typed vocabulary cannot express. Surfaced, never compared. */
  readonly otherConstraints: readonly string[];
  readonly careerDirection?: string;
  readonly preferences: readonly string[];
  /** Notes the person attached to a condition, carried through for display. */
  readonly notes: Partial<Record<UserConditionKind, string>>;
}

/**
 * How one condition lines up.
 *
 * Four outcomes, and the two silences are deliberately **not** the same thing:
 *
 * - `neutral` — the posting states something the person has no condition about. Information about
 *   the role, nothing to reconcile. Their silence is not turned into a requirement.
 * - `uncertain` — the person stated a condition and the posting did not answer it. This is the
 *   actionable unknown: something they care about that nobody has told them.
 *
 * Collapsing the two would either bury the question worth asking, or make every unmentioned detail
 * look like a problem. Nothing here guesses past either silence.
 */
export type ConditionAlignment = 'aligned' | 'conflict' | 'uncertain' | 'neutral';

export interface ConditionComparison {
  readonly kind: UserConditionKind;
  readonly alignment: ConditionAlignment;
  /** What the opportunity states, if it states anything. */
  readonly opportunity?: readonly string[];
  /** What the person has stated, if they have stated anything. */
  readonly user?: readonly string[];
  /** One readable sentence. This is what the person actually sees. */
  readonly summary: string;
  readonly note?: string;
}

/**
 * UC04 — `C_opportunity ∩ C_user`, made legible.
 *
 * **Conditions only.** Whether the person is a good fit for the role is Opportunity Evaluation, and
 * it belongs to Opportunity (ADR 0029). Widening this into professional fit is how Module 1 drifts
 * into a domain it does not own.
 *
 * The invariant that governs all of it:
 *
 *     ConstraintConflict ≠ ApplicationBlock
 *
 * Joby surfaces alignment, conflict and uncertainty. The decision to pursue stays entirely with the
 * person, and nothing here filters, disables, gates or ranks.
 */
export interface ContextIntersection {
  readonly aligned: readonly ConditionComparison[];
  readonly conflicts: readonly ConditionComparison[];
  readonly uncertain: readonly ConditionComparison[];
  /**
   * Relevant opportunity conditions the person has no view on.
   *
   * Worth seeing — it is what the role actually says — with nothing to reconcile. Kept apart from
   * `uncertain` so the unknowns that need an answer are not buried under details nobody has an
   * opinion about.
   */
  readonly neutral: readonly ConditionComparison[];
  /**
   * What **Opportunity Intelligence** reports as uncertain about the posting, verbatim.
   *
   * Belongs beside the uncertain comparisons because it is the same kind of thing to the reader —
   * "sponsorship policy is not stated" — but it is free text about the posting rather than a
   * comparison, so it is not folded into a condition kind. Mapping prose onto a kind would be a
   * guess dressed as structure.
   */
  readonly postingUncertainty: readonly string[];
  /** Free-text constraints, shown beside the comparison because nothing can compare them. */
  readonly otherConstraints: readonly string[];
  /** Always true. Present so a consumer reads it rather than assuming the opposite. */
  readonly blocksApplication: false;
}

/** The whole of Module 1's output for one opportunity. */
export interface AdaptationContextView {
  readonly context: AdaptationContext;
  readonly opportunity: OpportunityContext;
  readonly user: UserContext;
  readonly intersection: ContextIntersection;
  /** The lens this adaptation will start from, when one was selected. */
  readonly prior?: RepresentationPrior;
}

export interface CreateAdaptationContextInput {
  readonly personId: string;
  readonly opportunityId: string;
  readonly representationId?: string;
  readonly createdBy: string;
}

/** Everything Module 1 reads about the person, in one place, for the pure functions below. */
export interface RetrievedStatedContext {
  readonly personId: string;
  readonly identityRevision: number;
  readonly stated: StatedContext;
}
