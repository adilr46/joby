/**
 * Legacy Opportunity-understanding persistence. The only code that touches `intelligence_*` tables.
 *
 * It reads and writes **nothing** in `opportunity*`. Captured evidence reaches this module through
 * Opportunity's public interface and never through a join — which is what makes "raw evidence stays
 * distinguishable from interpreted understanding" a structural fact rather than a convention.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type { OpportunityUnderstanding } from './model';
import type { InterpretedUnderstanding } from './interpretation-port';

/** A stored reading, with the bookkeeping that says which reading it is and what it was made from. */
export interface StoredUnderstanding {
  readonly understanding: OpportunityUnderstanding;
  readonly interpreter: string;
  readonly evidenceIds: readonly string[];
  readonly createdAt: string;
}

interface UnderstandingRow extends Record<string, unknown> {
  opportunity_id: string;
  revision: number | string;
  content: InterpretedUnderstanding;
  interpreter: string;
  evidence_ids: string[];
  created_at: Date | string;
}

function toStored(row: UnderstandingRow): StoredUnderstanding {
  return {
    understanding: {
      ...row.content,
      opportunityId: row.opportunity_id,
      revision: Number(row.revision),
    },
    interpreter: row.interpreter,
    evidenceIds: row.evidence_ids,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

const COLUMNS = `opportunity_id, revision, content, interpreter, evidence_ids, created_at`;

export class OpportunityUnderstandingRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /**
   * Insert the next revision for this opportunity.
   *
   * The revision is computed from the table inside the caller's transaction, not passed in: two
   * concurrent interpretations both reading "latest is 3" would otherwise both write 4, and the
   * unique constraint is what turns that into a loud failure instead of a lost reading.
   */
  async insert(
    tx: Transaction,
    input: {
      id: string;
      opportunityId: string;
      content: InterpretedUnderstanding;
      interpreter: string;
      evidenceIds: readonly string[];
    },
  ): Promise<StoredUnderstanding> {
    const { rows } = await tx.query<UnderstandingRow>(
      `INSERT INTO intelligence_opportunity_understanding
         (id, opportunity_id, revision, content, interpreter, evidence_ids)
       VALUES (
         $1, $2,
         (SELECT coalesce(max(revision), 0) + 1
            FROM intelligence_opportunity_understanding
           WHERE opportunity_id = $2),
         $3::jsonb, $4, $5
       )
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.opportunityId,
        JSON.stringify(input.content),
        input.interpreter,
        [...input.evidenceIds],
      ],
    );
    return toStored(rows[0]!);
  }

  /** The current reading. */
  async findLatest(
    opportunityId: string,
    executor: Queryable = this.#db,
  ): Promise<StoredUnderstanding | undefined> {
    const { rows } = await executor.query<UnderstandingRow>(
      `SELECT ${COLUMNS} FROM intelligence_opportunity_understanding
       WHERE opportunity_id = $1
       ORDER BY revision DESC
       LIMIT 1`,
      [opportunityId],
    );
    return rows[0] ? toStored(rows[0]) : undefined;
  }

  /**
   * One specific reading.
   *
   * Needed because an Adaptation Context records the `opportunity_revision` it was built from, and a
   * revision it cannot retrieve later is a reference to nothing.
   */
  async findRevision(
    opportunityId: string,
    revision: number,
    executor: Queryable = this.#db,
  ): Promise<StoredUnderstanding | undefined> {
    const { rows } = await executor.query<UnderstandingRow>(
      `SELECT ${COLUMNS} FROM intelligence_opportunity_understanding
       WHERE opportunity_id = $1 AND revision = $2`,
      [opportunityId, revision],
    );
    return rows[0] ? toStored(rows[0]) : undefined;
  }

  /** Latest readings for many opportunities at once, so polling is one query rather than N. */
  async latestEvidenceSets(
    opportunityIds: readonly string[],
    executor: Queryable = this.#db,
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (opportunityIds.length === 0) return new Map();
    const { rows } = await executor.query<{ opportunity_id: string; evidence_ids: string[] }>(
      `SELECT DISTINCT ON (opportunity_id) opportunity_id, evidence_ids
         FROM intelligence_opportunity_understanding
        WHERE opportunity_id = ANY($1)
        ORDER BY opportunity_id, revision DESC`,
      [[...opportunityIds]],
    );
    return new Map(rows.map((row) => [row.opportunity_id, row.evidence_ids]));
  }
}
