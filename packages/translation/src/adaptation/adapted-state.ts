/**
 * Module 2 — Context Adaptation (UC05–UC08).
 *
 *   P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C
 *
 * **Representation-first.** The person's selected lens is the default adaptation surface; Durable
 * Identity is the authoritative *fallback reservoir*, consulted where the lens does not expose
 * something the opportunity asks for. Adaptation does not re-solve the whole identity for every
 * opportunity — that would make the lens decorative, and it is the thing the person actually
 * maintains.
 *
 *   P_i(E_t) = default adaptation surface
 *   E_t      = authoritative fallback reservoir
 *   A^C      = temporary, opportunity-specific
 *
 * Everything here is temporary and derived. Adapted State is composed on request from the lens, the
 * canonical snapshot and the interpreted context — nothing is stored, so nothing can drift, and the
 * retention and versioning questions ADR 0013 §10 defers stay deferred.
 */

import type { RepresentationEmphasis, RepresentationSection } from '@joby/identity/representation';
import type { OpportunityContext, UserContext } from './model';

/** Where an element of Adapted State came from. Both are canonical; they differ in *route*. */
export type EvidenceOrigin =
  /** Exposed by the selected Identity Representation — the default surface. */
  | 'representation'
  /** Recovered from Durable Identity because the lens did not expose it here. */
  | 'recovered';

/**
 * What the assessment concluded about one piece of the baseline.
 *
 * Suggestions about *this* opportunity's representation. None of them changes the lens: the person's
 * general positioning is theirs, and one application does not get to rewrite it (ADR 0015).
 */
export type RepresentationVerdict =
  /** Already exposed, already prominent, and relevant here. Leave it alone. */
  | 'well_represented'
  /** Relevant here and currently understated. */
  | 'emphasise'
  /** Exposed by the lens but with nothing the opportunity asks for behind it. */
  | 'de_emphasise';

/**
 * One canonical fact, as this opportunity's Adapted State carries it.
 *
 * `nodeId` and `canonicalTitle` are non-negotiable: every professional element traces to a confirmed
 * fact. `framing` and `emphasis` are contextual presentation over that fact, never a replacement
 * for it.
 */
export interface AdaptedElement {
  readonly nodeId: string;
  readonly section: RepresentationSection;
  /** What this Adapted State says — the lens's framing where one exists, canonical otherwise. */
  readonly title: string;
  /** What Explicit State records. Always present, always the fact underneath. */
  readonly canonicalTitle: string;
  readonly detail?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** Canonical capability components — the basis of every relevance claim below. */
  readonly capabilities: readonly string[];
  readonly origin: EvidenceOrigin;
  readonly emphasis?: RepresentationEmphasis;
  /**
   * Which of the opportunity's stated capabilities this element speaks to, by exact canonical
   * capability. Empty for an element carried for continuity rather than relevance.
   */
  readonly speaksTo: readonly string[];
  /** Why this element is here, in one readable sentence. */
  readonly rationale: string;
  readonly visibility: 'private' | 'public';
}

/** One thing the opportunity asks for that nothing in the lens exposes. */
export interface RepresentationGap {
  /** The capability the posting asks for, in the posting's words. */
  readonly capability: string;
  readonly required: boolean;
  /** Canonical evidence that speaks to it, found outside the lens's exposed set. */
  readonly recoverableNodeIds: readonly string[];
  readonly summary: string;
}

/** What the assessment concluded about one baseline element. */
export interface BaselineAssessment {
  readonly nodeId: string;
  readonly verdict: RepresentationVerdict;
  readonly speaksTo: readonly string[];
  readonly summary: string;
}

/**
 * UC06 — how the selected lens stands up to this opportunity.
 *
 * **Representational assessment, not opportunity evaluation.** Every judgement here is about the
 * *representation* — what it exposes, what it understates, where it is silent. Nothing judges the
 * opportunity, the person's suitability, or whether to apply. That is Opportunity's authority
 * (ADR 0007), and this module produces no score, rank or verdict about either.
 */
export interface RepresentationAssessment {
  readonly representationId: string;
  /** Element-by-element, over what the lens exposes. */
  readonly baseline: readonly BaselineAssessment[];
  /** What the opportunity asks for and the lens does not surface. */
  readonly gaps: readonly RepresentationGap[];
  /** Capabilities the posting asks for that no canonical evidence speaks to. Honest emptiness. */
  readonly unevidenced: readonly string[];
}

/**
 * `A^C` — one temporary, opportunity-specific professional state.
 *
 * Composed from the lens, the interpreted context and any recovered canonical evidence. It carries
 * the professional material downstream representation work needs **without rendering anything**: no
 * CV, no answer, no narrative. Those are Module 3.
 */
export interface AdaptedState {
  readonly contextId: string;
  readonly personId: string;
  readonly opportunityId: string;
  /** The lens this adaptation started from, when one was selected. */
  readonly representationId?: string;
  /** The canonical revision every element below was derived from. */
  readonly identityRevision: number;
  readonly opportunityRevision: number;
  readonly composedAt: string;
  /** Ordered as this opportunity should read it: what speaks to it first. */
  readonly elements: readonly AdaptedElement[];
  readonly assessment: RepresentationAssessment;
  /**
   * Whether Durable Identity had to be consulted beyond the lens.
   *
   * `false` is the normal path and the healthy one: the person's own positioning already covered
   * this opportunity.
   */
  readonly recoveryUsed: boolean;
  /** The interpreted context this was adapted to. Conditions inform; they never gate. */
  readonly opportunity: OpportunityContext;
  readonly user: UserContext;
}
