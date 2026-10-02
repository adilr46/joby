/**
 * **Router** — which Representation should this Opportunity start from? (ADR 0031)
 *
 * ```text
 * Identity (Representations)  ×  Opportunity  ->  starting prior
 * ```
 *
 * Deliberately small, and defined as much by what it refuses to do:
 *
 * - **It does not adapt.** Choosing a lens is not tailoring; the opportunity-specific delta is
 *   Adaptation's, and Router produces no Adapted State, draft or evidence selection.
 * - **It writes nothing.** Not Identity, not Opportunity. Both ports below are reads, and there is
 *   no write on either to call.
 * - **It does not judge the person.** The output says which lens covers most of what this posting
 *   asks about. It is not a fit score, not a recommendation to apply, and carries no verdict.
 *
 * A recommendation is a **starting prior, not a decision**. The person may choose another lens or
 * none, and applying with no lens at all is a supported, normal case — Adaptation works without one.
 */

/** What Router needs to know about one Representation. Read-only, and no canonical facts. */
export interface RoutableRepresentation {
  readonly representationId: string;
  readonly name: string;
  /**
   * The capabilities this lens currently *exposes*, from the evidence it includes.
   *
   * What a lens hides is deliberately absent: routing is about which positioning already speaks to
   * this posting. Hiding remains a positioning choice and never makes evidence unavailable later —
   * `HiddenInRepresentation ≠ UnavailableToAdaptation` still holds downstream.
   */
  readonly exposedCapabilities: readonly string[];
}

export interface RouterIdentityReader {
  listRoutableRepresentations(personId: string): Promise<readonly RoutableRepresentation[]>;
}

/** What Router needs from Opportunity: what the situation asks for. Never posting text. */
export interface RoutableOpportunity {
  readonly opportunityId: string;
  readonly revision: number;
  readonly requiredCapabilities: readonly string[];
  readonly preferredCapabilities: readonly string[];
}

export interface RouterOpportunityReader {
  getRoutableOpportunity(opportunityId: string): Promise<RoutableOpportunity | undefined>;
}

/**
 * Learned priors from PCI, consumed as **hints and never as authority** (ADR 0031).
 *
 * PCI may say "lenses like this one have tended to suit work like this". It cannot select, cannot
 * override a lens that plainly covers the posting better, and cannot write anything here. The
 * default implementation returns nothing, which is the correct answer until PCI exists.
 */
export interface RouterPriorSource {
  /**
   * A weight per representation id. Positive favours, negative disfavours.
   *
   * Bounded by the caller-supplied `priorInfluence` so a learned hint can break a tie but cannot
   * outvote observed coverage — a prior that overrules what the posting actually asks for is a
   * learned belief masquerading as evidence.
   */
  weightsFor(input: {
    readonly personId: string;
    readonly opportunityId: string;
    readonly representationIds: readonly string[];
  }): Promise<ReadonlyMap<string, number>>;
}

/** No PCI yet. Returning nothing is the honest answer, not a degraded one. */
export class NoLearnedPriors implements RouterPriorSource {
  async weightsFor(): Promise<ReadonlyMap<string, number>> {
    return new Map();
  }
}

export interface RoutingCandidate {
  readonly representationId: string;
  readonly name: string;
  /** Asked-for capabilities this lens already exposes. */
  readonly covers: readonly string[];
  /** Asked-for capabilities it does not — Adaptation's recovery problem, not a disqualification. */
  readonly uncovered: readonly string[];
  /** Coverage of what the posting asks, before any learned prior. */
  readonly coverage: number;
  /** The learned adjustment applied, if any. Zero when PCI said nothing. */
  readonly priorWeight: number;
}

export interface RepresentationRouting {
  readonly personId: string;
  readonly opportunityId: string;
  readonly opportunityRevision: number;
  /** Absent when the person keeps no Representation. A normal case, not a failure. */
  readonly selected?: RoutingCandidate;
  /** Every lens considered, best first, so the choice is inspectable rather than magic. */
  readonly considered: readonly RoutingCandidate[];
  /** One readable sentence. This is what the person sees if they ask why. */
  readonly reason: string;
  /** Whether a learned prior changed the ordering at all. */
  readonly priorsApplied: boolean;
}

export class OpportunityNotRoutableError extends Error {
  constructor(opportunityId: string) {
    super(
      `Opportunity '${opportunityId}' has no understanding to route against. Routing needs to know ` +
        'what the situation asks for.',
    );
    this.name = 'OpportunityNotRoutableError';
  }
}

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * How much a learned prior may move a candidate, as a fraction of one covered capability.
 *
 * Under 1 on purpose: a prior can order two lenses that cover the posting equally well, and cannot
 * promote one that covers it less. Observed coverage outranks learned belief.
 */
const DEFAULT_PRIOR_INFLUENCE = 0.5;

export interface RouterOptions {
  readonly identity: RouterIdentityReader;
  readonly opportunities: RouterOpportunityReader;
  readonly priors?: RouterPriorSource;
  readonly priorInfluence?: number;
  readonly opportunityDecisioning?: OpportunityEvaluatorOptions;
}

export class Router {
  readonly #identity: RouterIdentityReader;
  readonly #opportunities: RouterOpportunityReader;
  readonly #priors: RouterPriorSource;
  readonly #influence: number;
  readonly #opportunityEvaluator?: OpportunityEvaluator;

  constructor(options: RouterOptions) {
    this.#identity = options.identity;
    this.#opportunities = options.opportunities;
    this.#priors = options.priors ?? new NoLearnedPriors();
    this.#influence = options.priorInfluence ?? DEFAULT_PRIOR_INFLUENCE;
    this.#opportunityEvaluator = options.opportunityDecisioning
      ? new OpportunityEvaluator(options.opportunityDecisioning)
      : undefined;
  }

  async routeOpportunities(input: {
    readonly personId: string;
    readonly opportunityIds: readonly string[];
    readonly comparisonSetId?: string;
  }): Promise<OpportunityDecisioningResult> {
    if (!this.#opportunityEvaluator) {
      throw new Error('Router opportunity decisioning is not configured.');
    }
    const evaluations = await this.#opportunityEvaluator.evaluateOpportunitySet(input);
    const projections = rankOpportunities(evaluations);
    const ranking = projections.ranking;
    const policy = recommendOpportunityPolicy({ evaluations, ranking });
    return {
      personId: input.personId,
      comparisonSetId: evaluations[0]?.comparisonSetId ?? input.comparisonSetId ?? 'set:',
      evaluations,
      ranking,
      tiers: projections.tiers,
      pairwise: projections.pairwise,
      policy,
    };
  }

  /**
   * Recommend the Representation this opportunity should start from.
   *
   * Coverage is **normalised capability equality and nothing cleverer** — the same rule Adaptation
   * uses, so the lens Router picks is the lens that will genuinely need least recovery. No synonyms,
   * no similarity: a guess here would quietly send someone into an application on the wrong footing.
   */
  async recommendRepresentation(input: {
    readonly personId: string;
    readonly opportunityId: string;
  }): Promise<RepresentationRouting> {
    const opportunity = await this.#opportunities.getRoutableOpportunity(input.opportunityId);
    if (!opportunity) throw new OpportunityNotRoutableError(input.opportunityId);

    const asks = [...opportunity.requiredCapabilities, ...opportunity.preferredCapabilities];
    const representations = await this.#identity.listRoutableRepresentations(input.personId);

    if (representations.length === 0) {
      return {
        personId: input.personId,
        opportunityId: opportunity.opportunityId,
        opportunityRevision: opportunity.revision,
        considered: [],
        reason: 'You keep no representation yet, so this opportunity starts from your canonical history.',
        priorsApplied: false,
      };
    }

    const weights = await this.#priors.weightsFor({
      personId: input.personId,
      opportunityId: input.opportunityId,
      representationIds: representations.map((item) => item.representationId),
    });

    const candidates = representations.map((representation): RoutingCandidate => {
      const exposed = new Set(representation.exposedCapabilities.map(normalise));
      const covers = asks.filter((ask) => exposed.has(normalise(ask)));
      const uncovered = asks.filter((ask) => !exposed.has(normalise(ask)));
      return {
        representationId: representation.representationId,
        name: representation.name,
        covers,
        uncovered,
        coverage: covers.length,
        priorWeight: weights.get(representation.representationId) ?? 0,
      };
    });

    const scoreOf = (candidate: RoutingCandidate): number =>
      candidate.coverage + candidate.priorWeight * this.#influence;

    // Stable: equal scores keep the order Identity listed them in, so a recommendation does not
    // wobble between reads for reasons nobody can see.
    const ordered = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
    const withoutPriors = [...candidates].sort((a, b) => b.coverage - a.coverage);
    const priorsApplied =
      ordered[0]!.representationId !== withoutPriors[0]!.representationId ||
      candidates.some((candidate) => candidate.priorWeight !== 0);

    const selected = ordered[0]!;
    return {
      personId: input.personId,
      opportunityId: opportunity.opportunityId,
      opportunityRevision: opportunity.revision,
      selected,
      considered: ordered,
      reason: reasonFor(selected, asks.length),
      priorsApplied,
    };
  }
}

function reasonFor(selected: RoutingCandidate, asked: number): string {
  if (asked === 0) {
    return `The opportunity states no requirements, so '${selected.name}' is offered as your starting point.`;
  }
  if (selected.coverage === 0) {
    return `None of your representations speak to what this opportunity asks for; '${selected.name}' is offered as a starting point and the rest can be recovered from your history.`;
  }
  return `'${selected.name}' already speaks to ${selected.covers.join(', ')}.`;
}
import { OpportunityEvaluator, type OpportunityEvaluatorOptions } from './opportunity-evaluation';
import { type OpportunityDecisioningResult } from './opportunity-decisioning';
import { recommendOpportunityPolicy } from './opportunity-policy';
import { rankOpportunities } from './opportunity-ranking';
