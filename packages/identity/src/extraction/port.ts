/**
 * The extraction boundary.
 *
 * Provider-neutral by design (roadmap Tier 2): the domain depends on this interface, never on a
 * vendor SDK. An OpenAI adapter is the v1 default; swapping it must not touch anything in the
 * domain, and tests must be able to run without a network.
 */

import type { ReconstructionProposalContent } from '../model';

export interface ExtractionRequest {
  readonly sourceId: string;
  /** The source as text. Extractors never see the raw bytes or the filename. */
  readonly text: string;
}

export interface ExtractionResult {
  readonly content: ReconstructionProposalContent;
  /** Recorded on the proposal for provenance and reproducibility. */
  readonly model: string;
}

export interface CvExtractor {
  /** Stable identifier, stored on the proposal, e.g. `openai` or `deterministic`. */
  readonly name: string;
  /**
   * Propose Structure, Activity and Relations from a CV.
   *
   * Throwing is a normal path: the caller preserves the source and leaves the job retryable.
   * Returning an empty proposal is also valid — a source Joby could read nothing from is a real
   * outcome, and inventing content to avoid an empty result is the failure this whole slice is
   * built to prevent.
   */
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

/** Raised when a model returns something that is not a usable proposal. */
export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}
