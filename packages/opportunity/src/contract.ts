/**
 * The Opportunity module's public interface.
 *
 * This is the whole of what another implementation partition may do with captured opportunities.
 * The legacy Intelligence path reads evidence through it; only this partition writes capture state.
 *
 * Notice what is absent, and must stay absent: no role, company, requirement, condition or
 * capability is returned as an *interpreted* value. Opportunity returns what was captured and who it
 * came from. What it means belongs to Opportunity semantics and is derived in the separate
 * understanding partition (ADR 0029).
 */

import type {
  Opportunity,
  OpportunityEvidence,
  OpportunityEvidenceContent,
  OpportunityRecord,
} from './model';
import type { CaptureEvidenceInput, CaptureEvidenceResult } from './capture';

/**
 * What is currently held about one opportunity, for a consumer deciding whether its own derived
 * work is out of date.
 *
 * `evidenceIds` is the identity of the current evidence set. A consumer that recorded which ids it
 * worked from can tell, without reading a single byte, whether new material has arrived — which is
 * how the understanding partition finds outstanding work without capture knowing interpretation.
 */
export interface OpportunitySummary {
  readonly opportunityId: string;
  readonly evidenceIds: readonly string[];
  readonly latestCapturedAt: string;
  /** Opaque paging cursor. Pass the last one back as `after` to continue. */
  readonly cursor: string;
}

/** One piece of captured evidence, decoded, with where it came from. */
export interface EvidenceText {
  readonly evidenceId: string;
  readonly kind: string;
  readonly source: string;
  readonly uri?: string;
  readonly text: string;
}

export interface OpportunityModule {
  /** UC01. Creates the opportunity when `opportunityId` is omitted; attaches evidence when given. */
  captureEvidence(input: CaptureEvidenceInput): Promise<CaptureEvidenceResult>;

  getOpportunity(opportunityId: string): Promise<OpportunityRecord | undefined>;

  listEvidence(opportunityId: string): Promise<readonly OpportunityEvidence[]>;

  /** The bytes exactly as captured. Loaded one item at a time, never in a list. */
  getEvidenceContent(evidenceId: string): Promise<OpportunityEvidenceContent | undefined>;

  /**
   * Captured evidence decoded as text, with the provenance a reader needs to attribute what it
   * read.
   *
   * Decoding bytes into a string is not interpretation — it is Opportunity handing over what it
   * holds in a usable form. Nothing is parsed, stripped or normalised here: HTML arrives as the
   * HTML that was captured, because deciding what a document *means* belongs to the understanding partition.
   */
  readEvidenceText(opportunityId: string): Promise<readonly EvidenceText[]>;

  /**
   * Opportunities and their current evidence sets, oldest capture first, in pages.
   *
   * Bounded on purpose: a consumer pages, it does not stream the world. **Ordered and pageable
   * rather than "most recent"**, because a consumer deriving outstanding work from a fixed recent
   * window can never reach anything that falls out of it — an opportunity whose evidence never
   * changes would sit un-processed forever while newer ones cycle past it.
   *
   * `after` is the exclusive cursor from a previous page's last `cursor` value.
   */
  listSummaries(options?: {
    readonly limit?: number;
    readonly after?: string;
  }): Promise<readonly OpportunitySummary[]>;
}

export type { Opportunity, OpportunityEvidence, OpportunityEvidenceContent, OpportunityRecord };
