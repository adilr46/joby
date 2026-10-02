/**
 * Opportunity's persistence. The only code that touches `opportunity*` tables.
 *
 * Transactions are passed in, never opened here: the opportunity row, its evidence and the outbox
 * row have to commit together, and that is only guaranteeable if the caller owns the transaction.
 *
 * **There is no update path for captured evidence.** That is the immutability rule expressed as an
 * absence rather than as a comment — you cannot overwrite what has no setter.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  EvidenceKind,
  Opportunity,
  OpportunityEvidence,
  OpportunityEvidenceContent,
} from './model';

interface OpportunityRow extends Record<string, unknown> {
  id: string;
  title: string | null;
  organisation: string | null;
  created_at: Date | string;
}

interface EvidenceRow extends Record<string, unknown> {
  id: string;
  opportunity_id: string;
  kind: string;
  source: string;
  external_ref: string | null;
  uri: string | null;
  content_type: string;
  checksum: string;
  byte_length: string | number;
  captured_at: Date | string;
}

/** `content` is deliberately excluded: reading a list of evidence must not load every posting. */
const EVIDENCE_COLUMNS = `id, opportunity_id, kind, source, external_ref, uri, content_type,
                          checksum, octet_length(content) AS byte_length, captured_at`;

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    ...(row.title === null ? {} : { title: row.title }),
    ...(row.organisation === null ? {} : { organisation: row.organisation }),
    createdAt: iso(row.created_at),
  };
}

function toEvidence(row: EvidenceRow): OpportunityEvidence {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    kind: row.kind as EvidenceKind,
    source: row.source,
    ...(row.external_ref === null ? {} : { externalRef: row.external_ref }),
    ...(row.uri === null ? {} : { uri: row.uri }),
    contentType: row.content_type,
    checksum: row.checksum,
    byteLength: Number(row.byte_length),
    capturedAt: iso(row.captured_at),
  };
}

export class OpportunityRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async insertOpportunity(
    tx: Transaction,
    opportunity: { id: string; title?: string; organisation?: string },
  ): Promise<Opportunity> {
    const { rows } = await tx.query<OpportunityRow>(
      `INSERT INTO opportunity (id, title, organisation)
       VALUES ($1, $2, $3)
       RETURNING id, title, organisation, created_at`,
      [opportunity.id, opportunity.title ?? null, opportunity.organisation ?? null],
    );
    return toOpportunity(rows[0]!);
  }

  async insertEvidence(
    tx: Transaction,
    evidence: {
      id: string;
      opportunityId: string;
      kind: EvidenceKind;
      source: string;
      externalRef?: string;
      uri?: string;
      contentType: string;
      content: Buffer;
      checksum: string;
    },
  ): Promise<OpportunityEvidence> {
    const { rows } = await tx.query<EvidenceRow>(
      `INSERT INTO opportunity_evidence
         (id, opportunity_id, kind, source, external_ref, uri, content_type, content, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${EVIDENCE_COLUMNS}`,
      [
        evidence.id,
        evidence.opportunityId,
        evidence.kind,
        evidence.source,
        evidence.externalRef ?? null,
        evidence.uri ?? null,
        evidence.contentType,
        evidence.content,
        evidence.checksum,
      ],
    );
    return toEvidence(rows[0]!);
  }

  async findOpportunity(id: string, executor: Queryable = this.#db): Promise<Opportunity | undefined> {
    const { rows } = await executor.query<OpportunityRow>(
      `SELECT id, title, organisation, created_at FROM opportunity WHERE id = $1`,
      [id],
    );
    return rows[0] ? toOpportunity(rows[0]) : undefined;
  }

  async listEvidence(
    opportunityId: string,
    executor: Queryable = this.#db,
  ): Promise<readonly OpportunityEvidence[]> {
    const { rows } = await executor.query<EvidenceRow>(
      `SELECT ${EVIDENCE_COLUMNS} FROM opportunity_evidence
       WHERE opportunity_id = $1
       ORDER BY captured_at, id`,
      [opportunityId],
    );
    return rows.map(toEvidence);
  }

  async findEvidenceByChecksum(
    opportunityId: string,
    checksum: string,
    executor: Queryable = this.#db,
  ): Promise<OpportunityEvidence | undefined> {
    const { rows } = await executor.query<EvidenceRow>(
      `SELECT ${EVIDENCE_COLUMNS} FROM opportunity_evidence
       WHERE opportunity_id = $1 AND checksum = $2`,
      [opportunityId, checksum],
    );
    return rows[0] ? toEvidence(rows[0]) : undefined;
  }

  /** The bytes, exactly as received. Loaded only when a caller asks for one specific item. */
  async getEvidenceContent(
    evidenceId: string,
    executor: Queryable = this.#db,
  ): Promise<OpportunityEvidenceContent | undefined> {
    const { rows } = await executor.query<EvidenceRow & { content: Buffer }>(
      `SELECT ${EVIDENCE_COLUMNS}, content FROM opportunity_evidence WHERE id = $1`,
      [evidenceId],
    );
    const row = rows[0];
    return row ? { ...toEvidence(row), content: row.content } : undefined;
  }
}
