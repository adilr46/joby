/**
 * Identity Representation types.
 *
 *   V_i = P_i(E_t)
 *
 * A persistent, reusable, **non-canonical** projection of Durable Identity under a named lens —
 * "Markets", "Investment Banking", "Software Engineering". The person keeps it and returns to it.
 *
 * Not to be confused with a **contextual representation**, which is Adaptation's: a tailored CV or
 * application answer rendered from Adapted State for one opportunity (ADRs 0012, 0013). The full
 * term "Identity Representation" is used everywhere for exactly that reason.
 *
 *   Identity Representation:   which reusable projection of my professional truth do I want?
 *   Adaptation:                how should that truth be interpreted for this exact opportunity?
 */

import type { EpistemicStatus, PermanentIdentityView, SourceVisibility } from '@joby/identity';

export const REPRESENTATION_REFERENCE_KINDS = [
  'writing_sample',
  'cover_letter',
  'application_answer',
] as const;

export type RepresentationReferenceKind = (typeof REPRESENTATION_REFERENCE_KINDS)[number];

/** User-owned expression material; it is never canonical professional evidence. */
export interface RepresentationReference {
  readonly id: string;
  readonly personId: string;
  readonly kind: RepresentationReferenceKind;
  readonly label: string;
  readonly content: string;
  readonly checksum: string;
  readonly capturedAt: string;
  readonly providedBy: string;
}

export interface AddRepresentationReferenceInput {
  readonly personId: string;
  readonly kind: RepresentationReferenceKind;
  readonly label: string;
  readonly content: string;
  readonly providedBy: string;
}

/**
 * The stored half: a lens, and nothing factual.
 *
 * Everything here is the person's own choice about how they want to look at their history. No field
 * asserts anything about their professional reality — that lives in R, and this points at it.
 */
export interface IdentityRepresentation {
  readonly id: string;
  readonly personId: string;
  /** What the person calls it. `Markets`. */
  readonly name: string;
  /** The lens in their words. Opaque free text, deliberately not a taxonomy. */
  readonly purpose?: string;
  /** This representation's own revision. Guards the decisions later slices hang off it. */
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
}

/**
 * Where the content came from, so a representation can never be mistaken for a source.
 *
 * The identity revision is the load-bearing field: it says *which* state of the person this content
 * was derived from, and it moves whenever canonical Explicit State does.
 */
export interface RepresentationGrounding {
  readonly personId: string;
  readonly durableIdentityId: string;
  /** The canonical Explicit State revision this content was derived from. */
  readonly identityRevision: number;
  /** When this derivation ran. Reading again after a correction produces a different answer. */
  readonly derivedAt: string;
}

// --- The positioning decision layer (ADR 0015) -------------------------------------------------
//
//   E_t + Decisions_i -> V_i
//
// Decisions are about canonical nodes. None of the types below carries a professional fact.

/** Per-fact emphasis. Absent is neutral, and neutral is the default rather than a gap. */
export type RepresentationEmphasis = 'emphasised' | 'de_emphasised';

/**
 * What the person decided about one canonical fact, in one lens.
 *
 * `nodeId` is the whole point: a decision cannot exist without the fact it is about, and it holds
 * nothing of that fact but its identifier.
 */
export interface RepresentationDecision {
  readonly id: string;
  readonly representationId: string;
  readonly nodeId: string;
  /** UC05. Hidden **in this lens** — still canonical, still readable, still available to Adaptation. */
  readonly included: boolean;
  /** UC06. Lower is higher priority; absent is unranked and sorts last. */
  readonly priority?: number;
  /** UC07, per fact. */
  readonly emphasis?: RepresentationEmphasis;
  /** UC08. Context-independent wording for this fact here. Presentation, never a replacement fact. */
  readonly framing?: string;
  readonly decidedAt: string;
  readonly decidedBy: string;
}

/**
 * One change to one fact's positioning.
 *
 * Omitting a field leaves it as it was; `null` clears it back to the neutral default. The same
 * convention as a correction to Explicit State, for the same reason: "leave this alone" and "remove
 * what I said" are different instructions.
 */
export interface RepresentationDecisionInput {
  readonly nodeId: string;
  readonly included?: boolean;
  readonly priority?: number | null;
  readonly emphasis?: RepresentationEmphasis | null;
  readonly framing?: string | null;
}

export interface ApplyRepresentationDecisionsInput {
  readonly representationId: string;
  /** The lens revision the user read. Stale means someone else repositioned it first. */
  readonly expectedRevision: number;
  readonly decisions: readonly RepresentationDecisionInput[];
  readonly decidedBy: string;
}

/**
 * UC07 at the level of the lens: what this representation generally leads with.
 *
 * A theme is a positioning choice — "quantitative reasoning" — and never a claim that the person
 * has that quality. Claims come from canonical facts, with provenance.
 */
export interface PositioningTheme {
  readonly id: string;
  readonly label: string;
  /** Explicit order: a positioning list the person arranged is not a set. */
  readonly position: number;
}

export interface SetPositioningInput {
  readonly representationId: string;
  readonly expectedRevision: number;
  /** The whole ordered list, replacing what was there. */
  readonly themes: readonly string[];
  readonly setBy: string;
}

/** Which section of the projection this canonical fact surfaced in. */
export type RepresentationSection = 'education' | 'experience' | 'projects' | 'achievements';

/** Re-exported for the rendering layer, which must carry visibility through to a disclosure surface. */
export type SourceVisibilityOfEntry = SourceVisibility;

/**
 * One canonical fact, as this lens positions it.
 *
 * **Every canonical fact appears here, including hidden ones**, marked rather than dropped. That is
 * deliberate and load-bearing: hiding is a positioning prior, not an evidence boundary, and a
 * consumer — a future Adaptation above all — must be able to see what was set aside and recover it
 * when a specific role makes it locally useful (ADR 0015).
 *
 * `canonicalTitle` always travels beside `framing`, so reinterpreted wording can never obscure what
 * Explicit State actually records.
 */
export interface PositionedEntry {
  readonly nodeId: string;
  readonly section: RepresentationSection;
  /** What this lens says: the framing where one was set, the canonical label otherwise. */
  readonly title: string;
  /** What Explicit State says, always. Framing presents truth; it does not replace it. */
  readonly canonicalTitle: string;
  readonly detail?: string;
  /** Verbatim from the source, exactly as R holds them. A lens never sharpens a vague date. */
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** The activity's canonical capability components. Carried through, never edited by a lens. */
  readonly capabilities?: readonly string[];
  readonly framing?: string;
  readonly included: boolean;
  readonly priority?: number;
  readonly emphasis?: RepresentationEmphasis;
  readonly epistemicStatus: EpistemicStatus;
  readonly visibility: SourceVisibility;
}

/**
 * The lens applied: `E_t + Decisions_i`.
 *
 * `evidence` is ordered as the lens positions it — ranked first, then canonical order, with hidden
 * facts last and flagged. A renderer takes the included ones; nothing is removed from the object.
 */
export interface RepresentationPositioning {
  readonly themes: readonly PositioningTheme[];
  /** The raw decisions, so a consumer can see the choices themselves rather than their effect. */
  readonly decisions: readonly RepresentationDecision[];
  readonly evidence: readonly PositionedEntry[];
}

/**
 * A representation as read: the stored lens, its lineage, canonical content derived **now**, and
 * the positioning applied over it.
 *
 * `projection` is the same read-time projection of Reconstructed State that the Permanent Identity
 * View uses, and it is deliberately the same type rather than a parallel one. It stays **ungoverned
 * by the lens** — it is what Durable Identity says, in full — while `positioning` is what this lens
 * does with it. Keeping both means a lens can never quietly become the only way to see the person.
 *
 * Nothing here is stored except the lens and its decisions. The rest is a query result.
 */
export interface IdentityRepresentationView {
  readonly representation: IdentityRepresentation;
  readonly derivedFrom: RepresentationGrounding;
  readonly projection: PermanentIdentityView;
  readonly positioning: RepresentationPositioning;
}

export interface CreateRepresentationInput {
  readonly personId: string;
  readonly name: string;
  readonly purpose?: string;
  readonly createdBy: string;
}
