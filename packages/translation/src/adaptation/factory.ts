/**
 * Composing the Adaptation Service.
 *
 * Adaptation reads Durable Identity **through the same public contract every other domain uses** —
 * not a repository, not a table, and not a privileged internal path just because both live in one
 * package (ADR 0012). The adapter below is the whole of that access, and it is read-only by
 * construction: there is no write on `AdaptationIdentityReader` to call.
 *
 * The opportunity port is supplied by the caller, because only a composition root may import the
 * relevant owners. That keeps a cross-owner dependency cycle off the
 * package graph.
 */

import type { Database } from '@joby/database';

import { DeterministicRepresentationWriter } from './deterministic-writer';
import type { AdaptationModule } from './contract';
import type {
  AdaptationDurableIdentityReader,
  AdaptationRepresentationReader,
  OpportunityUnderstandingPort,
} from './ports';
import { AdaptationContextRepository, AdaptationService } from './service';

/** Adapt the Identity contract to the narrow, read-only window Adaptation needs. */
export interface CreateAdaptationOptions {
  readonly db: Database;
  readonly identity: AdaptationDurableIdentityReader;
  readonly representations: AdaptationRepresentationReader;
  /** An Opportunity Intelligence adapter, currently wired from the legacy implementation path. */
  readonly opportunities: OpportunityUnderstandingPort;
  /**
   * UC09's routing policy. Omitted means the provisional placeholder — there is no decided policy
   * yet, and a future one is supplied here without changing anything else.
   */
  /**
   * The writer behind UC10/UC11. Defaults to the deterministic one, which composes rather than
   * generates — offline, and the reason the grounding rules are testable without a network.
   */
  /** `SatisfactionGate(...)` — provisional and replaceable (ADR 0022). */
  /** `ResolveReferenceConflict(...)` — provisional and replaceable (ADR 0021). */
}

export function createAdaptation(options: CreateAdaptationOptions): AdaptationModule {
  return new AdaptationService({
    db: options.db,
    writer: new DeterministicRepresentationWriter(),
    repository: new AdaptationContextRepository(options.db),
    identity: options.identity,
    representations: options.representations,
    opportunities: options.opportunities,
  });
}
