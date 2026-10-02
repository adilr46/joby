/**
 * Composing the understanding capability.
 *
 * The evidence reader is supplied by the caller so understanding stays decoupled from capture's
 * persistence, and so a model-backed interpreter can be swapped in without touching anything else.
 */

import type { Database } from '@joby/database';

import { DeterministicOpportunityInterpreter } from './deterministic-interpreter';
import type { OpportunityInterpreter } from './interpretation-port';
import { OpportunityUnderstandingRepository } from './understanding-repository';
import { OpportunityUnderstandingService, type OpportunityEvidenceReader } from './understanding';

export interface CreateOpportunityUnderstandingOptions {
  readonly db: Database;
  readonly opportunities: OpportunityEvidenceReader;
  /** Defaults to the deterministic interpreter, which reads what is stated and infers nothing. */
  readonly interpreter?: OpportunityInterpreter;
}

export function createOpportunityUnderstanding(
  options: CreateOpportunityUnderstandingOptions,
): OpportunityUnderstandingService {
  return new OpportunityUnderstandingService({
    db: options.db,
    repository: new OpportunityUnderstandingRepository(options.db),
    opportunities: options.opportunities,
    interpreter: options.interpreter ?? new DeterministicOpportunityInterpreter(),
  });
}
