/** Read capabilities consumed by Adaptation. All mutation remains with the semantic owner. */
import type { PermanentIdentityView, StatedContext } from '@joby/identity';
import type { IdentityRepresentationView, RepresentationReference, RepresentationPrior } from '@joby/identity/representation';

/**
 * Opportunity's attributed understanding, as Adaptation consumes it.
 *
 * A **consumer-side view**, declared here rather than imported, so `@joby/translation` does not
 * depend on `@joby/opportunity`. An app composition root supplies the adapter — the same shape that
 * keeps every other cross-authority read acyclic.
 *
 * Adaptation never reads a job description. Structured understanding arrives; interpreting posting
 * text is Opportunity's authority (ADR 0031).
 */
export interface OpportunityUnderstandingView {
  readonly opportunityId: string;
  readonly revision: number;
  readonly role?: string;
  readonly company?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly preferredCapabilities?: readonly string[];
  readonly responsibilities?: readonly string[];
  readonly conditions?: Partial<Record<string, readonly string[]>>;
  readonly applicationQuestions?: readonly string[];
  readonly attribution?: readonly string[];
  readonly uncertainty?: readonly string[];
}

export interface OpportunityUnderstandingPort {
  /** The current understanding of this opportunity, or undefined if none has been produced. */
  getUnderstanding(opportunityId: string): Promise<OpportunityUnderstandingView | undefined>;
}

export interface AdaptationDurableIdentityReader {
  personExists(personId: string): Promise<boolean>;
  readStatedContext(personId: string): Promise<StatedContext | undefined>;
  /**
   * Which canonical revision this contextual work is against.
   *
   * Separate from `projectIdentity` because it is what most paths actually need. How Durable
   * Identity answers it cheaply is Durable Identity's business, not Adaptation's.
   */
  readIdentityRevision(personId: string): Promise<number | undefined>;
  /**
   * The canonical evidence reservoir.
   *
   * Called **on demand**: only where the Representation does not expose something this opportunity
   * asks about. `HiddenInRepresentation != UnavailableToAdaptation` — the lens is a prior, not an
   * evidence boundary — but a lens that already covers the posting needs no reservoir at all.
   */
  projectIdentity(personId: string): Promise<PermanentIdentityView | undefined>;
}

export interface AdaptationRepresentationReader {
  getRepresentation(representationId: string): Promise<IdentityRepresentationView | undefined>;
  getRepresentationPrior(representationId: string): Promise<RepresentationPrior | undefined>;
  listRepresentationReferences(personId: string): Promise<readonly RepresentationReference[]>;
}
