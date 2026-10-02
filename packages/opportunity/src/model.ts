/**
 * What Opportunity holds.
 *
 * **An Opportunity is not a JobPosting.** A posting is one kind of evidence attached to an
 * opportunity — currently the most common, which is exactly why the shallow modelling is tempting.
 * A placement scheme, an internship cohort, a research position, a competition and a speculative
 * approach to an organisation are all opportunities, and several of them have no posting, no URI
 * and no deadline.
 *
 * So nothing posting-shaped is required anywhere below. A design that only works when a URL exists
 * is modelling the posting, not the opportunity.
 */

/**
 * How a piece of evidence arrived.
 *
 * Small and closed, but not posting-only: a forwarded email and a note from a conversation are how
 * placement opportunities actually reach a student, and excluding them would force real material to
 * be mislabelled as a posting.
 */
export const EVIDENCE_KINDS = ['posting', 'description', 'email', 'note'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** This release retains text. Binary capture needs a parser and is deferred, as it was for CVs. */
export const SUPPORTED_CONTENT_TYPES = ['text/plain', 'text/markdown', 'text/html'] as const;

/**
 * An opportunity record.
 *
 * `title` and `organisation` are the **caller's own labels** for their record and are optional.
 * They are deliberately not the interpreted role and company: those are Opportunity understanding output
 * (ADR 0029). Capturing something nobody has read yet, with neither label, is a normal case.
 */
export interface Opportunity {
  readonly id: string;
  readonly title?: string;
  readonly organisation?: string;
  readonly createdAt: string;
}

/**
 * One piece of captured evidence, with its provenance.
 *
 * Immutable. There is no update path in the repository, because postings are edited and deleted and
 * a person may need to know what it said when they applied.
 */
export interface OpportunityEvidence {
  readonly id: string;
  readonly opportunityId: string;
  readonly kind: EvidenceKind;
  /** Where it came from, in the caller's words. Free text: the set of sources is not closeable. */
  readonly source: string;
  /** The source's own identifier where one exists — the strongest deduplication signal. */
  readonly externalRef?: string;
  /** Where it was seen. Absent for anything that did not come from a page. */
  readonly uri?: string;
  readonly contentType: string;
  readonly checksum: string;
  readonly byteLength: number;
  readonly capturedAt: string;
}

/** Evidence together with the bytes exactly as they were received. */
export interface OpportunityEvidenceContent extends OpportunityEvidence {
  readonly content: Buffer;
}

/** An opportunity and everything captured about it. */
export interface OpportunityRecord {
  readonly opportunity: Opportunity;
  readonly evidence: readonly OpportunityEvidence[];
}
