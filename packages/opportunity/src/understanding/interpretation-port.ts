/**
 * The opportunity interpretation boundary (UC02).
 *
 * Provider-neutral by design, exactly as CV extraction is: Opportunity understanding depends on this interface,
 * never on a vendor SDK. A model-backed interpreter is a later adapter choice; swapping it must not
 * touch anything else in this module, and tests must run without a network.
 */

import type { OpportunityUnderstanding } from './model';

/** One piece of captured evidence, as text, with the provenance needed to attribute a reading. */
export interface EvidenceForInterpretation {
  readonly evidenceId: string;
  readonly kind: string;
  /** Where it came from, in the capturer's words. */
  readonly source: string;
  readonly uri?: string;
  readonly text: string;
}

export interface InterpretationRequest {
  readonly opportunityId: string;
  /** Everything currently captured about this opportunity. Never empty. */
  readonly evidence: readonly EvidenceForInterpretation[];
}

/**
 * What an interpreter returns.
 *
 * `opportunityId` and `revision` are **not** here: which reading this is, is the owning partition's
 * bookkeeping, and an interpreter that could choose its own revision could overwrite one.
 */
export type InterpretedUnderstanding = Omit<OpportunityUnderstanding, 'opportunityId' | 'revision'>;

export interface InterpretationResult {
  readonly understanding: InterpretedUnderstanding;
  /** Recorded for provenance and reproducibility, e.g. `deterministic` or a model id. */
  readonly interpreter: string;
}

export interface OpportunityInterpreter {
  /** Stable identifier, stored on the understanding. */
  readonly name: string;
  /**
   * Read captured evidence into a structured understanding.
   *
   * Throwing is a normal path: the caller preserves the evidence and the opportunity stays
   * outstanding, so it can be re-read when the cause is fixed.
   *
   * **Returning a thin understanding is also valid.** Evidence that states almost nothing is a real
   * outcome, and the honest response is a sparse reading with the gaps named in `uncertainty` —
   * inventing a requirement to look useful is the failure this whole path exists to prevent.
   */
  interpret(request: InterpretationRequest): Promise<InterpretationResult>;
}

/** Raised when an interpreter returns something that is not a usable understanding. */
export class InterpretationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InterpretationError';
  }
}
