/**
 * UC01 — capturing opportunity evidence.
 *
 * The guarantee this rests on:
 *
 *   BEGIN
 *     create the opportunity   (when this is the first evidence for it)
 *     insert the evidence, immutably
 *   COMMIT
 *
 * Nothing here interprets anything. Turning captured material into role, company, requirements and
 * conditions belongs to Opportunity semantics but is implemented in the legacy Intelligence
 * partition; this capture partition must not acquire or mutate that state — which is
 * why there is no parser, no field extraction and no `role`/`company` write anywhere below.
 *
 * The bytes are retained exactly as received. Postings are edited and deleted; a person may later
 * need to know what it said when they applied, and an interpreter improves after the fact.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { Database } from '@joby/database';

import {
  EVIDENCE_KINDS,
  SUPPORTED_CONTENT_TYPES,
  type EvidenceKind,
  type Opportunity,
  type OpportunityEvidence,
} from './model';
import type { OpportunityRepository } from './repository';

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

export class UnsupportedEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedEvidenceError';
  }
}

export class EvidenceTooLargeError extends Error {
  constructor(size: number) {
    super(`Evidence is ${size} bytes; the limit is ${MAX_EVIDENCE_BYTES}.`);
    this.name = 'EvidenceTooLargeError';
  }
}

export class OpportunityNotFoundError extends Error {
  constructor(opportunityId: string) {
    super(`No opportunity '${opportunityId}'.`);
    this.name = 'OpportunityNotFoundError';
  }
}

export interface CaptureEvidenceInput {
  /**
   * Omit to create a new opportunity. Supply it to attach further evidence to one that exists —
   * a second posting, the recruiter's email, a note from a conversation.
   */
  readonly opportunityId?: string;
  /** The caller's own label. Never the interpreted role produced by Opportunity understanding. */
  readonly title?: string;
  /** The caller's own label. Never the resolved company entity. */
  readonly organisation?: string;
  readonly kind?: EvidenceKind;
  /** Where this came from, in the caller's words. */
  readonly source: string;
  readonly externalRef?: string;
  readonly uri?: string;
  readonly contentType: string;
  readonly content: Buffer;
}

export interface CaptureEvidenceResult {
  readonly opportunity: Opportunity;
  readonly evidence: OpportunityEvidence;
  /** True when these exact bytes were already held for this opportunity and nothing was stored. */
  readonly duplicate: boolean;
}

export class OpportunityCaptureService {
  readonly #db: Database;
  readonly #repository: OpportunityRepository;

  constructor(dependencies: { db: Database; repository: OpportunityRepository }) {
    this.#db = dependencies.db;
    this.#repository = dependencies.repository;
  }

  async capture(input: CaptureEvidenceInput): Promise<CaptureEvidenceResult> {
    const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!(SUPPORTED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new UnsupportedEvidenceError(
        `Unsupported content type '${input.contentType}'. This release accepts ${SUPPORTED_CONTENT_TYPES.join(', ')}.`,
      );
    }

    const kind = input.kind ?? 'posting';
    if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) {
      throw new UnsupportedEvidenceError(
        `'${kind}' is not an evidence kind. Known kinds: ${EVIDENCE_KINDS.join(', ')}.`,
      );
    }

    const source = input.source.trim();
    if (source.length === 0) {
      throw new UnsupportedEvidenceError(
        "'source' is required: evidence with no provenance cannot be traced back to anywhere.",
      );
    }

    if (input.content.byteLength === 0) {
      throw new UnsupportedEvidenceError('Evidence is empty.');
    }
    if (input.content.byteLength > MAX_EVIDENCE_BYTES) {
      throw new EvidenceTooLargeError(input.content.byteLength);
    }

    const checksum = createHash('sha256').update(input.content).digest('hex');

    // Re-capturing the same bytes is one piece of evidence, not two. Checked here as a fast path;
    // the unique index is what actually enforces it.
    if (input.opportunityId) {
      const existing = await this.#repository.findEvidenceByChecksum(input.opportunityId, checksum);
      if (existing) {
        const opportunity = await this.#repository.findOpportunity(input.opportunityId);
        if (opportunity) return { opportunity, evidence: existing, duplicate: true };
      }
    }

    return this.#db.transaction(async (tx) => {
      let opportunity: Opportunity;

      if (input.opportunityId === undefined) {
        opportunity = await this.#repository.insertOpportunity(tx, {
          id: randomUUID(),
          ...(input.title ? { title: input.title.trim() } : {}),
          ...(input.organisation ? { organisation: input.organisation.trim() } : {}),
        });
      } else {
        const existing = await this.#repository.findOpportunity(input.opportunityId, tx);
        if (!existing) throw new OpportunityNotFoundError(input.opportunityId);
        // Deliberately not updated from this capture. The record's labels are what they were; a
        // later capture adds evidence, it does not silently rewrite the opportunity.
        opportunity = existing;
      }

      const evidence = await this.#repository.insertEvidence(tx, {
        id: randomUUID(),
        opportunityId: opportunity.id,
        kind,
        source,
        contentType,
        content: input.content,
        checksum,
        ...(input.externalRef ? { externalRef: input.externalRef.trim() } : {}),
        ...(input.uri ? { uri: input.uri.trim() } : {}),
      });

      return { opportunity, evidence, duplicate: false };
    });
  }
}
