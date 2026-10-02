/**
 * Persistence for Identity Representations and their positioning decisions.
 *
 * **Three tables, all its own:** `identity_representation`, and the `_decision` and `_theme` tables
 * that hang off it. It writes no canonical node, relation or provenance — the only canonical thing
 * it can name is a node **id**, as the subject of a decision (ADRs 0014, 0015).
 *
 * The one canonical read it performs is an ownership check: a lens may only position facts that
 * belong to the person whose lens it is.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  IdentityRepresentation,
  PositioningTheme,
  RepresentationDecision,
  RepresentationEmphasis,
} from './model';

interface RepresentationRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  name: string;
  purpose: string | null;
  revision: number;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
}

interface DecisionRow extends Record<string, unknown> {
  id: string;
  representation_id: string;
  node_id: string;
  included: boolean;
  priority: number | null;
  emphasis: string | null;
  framing: string | null;
  decided_at: Date | string;
  decided_by: string;
}

const COLUMNS = 'id, person_id, name, purpose, revision, created_at, updated_at, created_by';

const DECISION_COLUMNS = `id, representation_id, node_id, included, priority, emphasis, framing,
                          decided_at, decided_by`;

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toDecision(row: DecisionRow): RepresentationDecision {
  return {
    id: row.id,
    representationId: row.representation_id,
    nodeId: row.node_id,
    included: row.included,
    decidedAt: iso(row.decided_at),
    decidedBy: row.decided_by,
    // Null stays absent: neutral is the default, and an absent decision must not round-trip into a
    // stored opinion the person never expressed.
    ...(row.priority === null ? {} : { priority: row.priority }),
    ...(row.emphasis === null ? {} : { emphasis: row.emphasis as RepresentationEmphasis }),
    ...(row.framing === null ? {} : { framing: row.framing }),
  };
}

function toRepresentation(row: RepresentationRow): IdentityRepresentation {
  return {
    id: row.id,
    personId: row.person_id,
    name: row.name,
    revision: row.revision,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    createdBy: row.created_by,
    // Absent stays absent: an unset lens must not round-trip into an empty statement of purpose.
    ...(row.purpose === null ? {} : { purpose: row.purpose }),
  };
}

export class RepresentationRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async insert(
    input: { id: string; personId: string; name: string; purpose?: string; createdBy: string },
    runner: Queryable = this.#db,
  ): Promise<IdentityRepresentation> {
    const { rows } = await runner.query<RepresentationRow>(
      `INSERT INTO identity_representation (id, person_id, name, purpose, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [input.id, input.personId, input.name, input.purpose ?? null, input.createdBy],
    );
    return toRepresentation(rows[0]!);
  }

  async find(id: string, runner: Queryable = this.#db): Promise<IdentityRepresentation | undefined> {
    const { rows } = await runner.query<RepresentationRow>(
      `SELECT ${COLUMNS} FROM identity_representation WHERE id = $1`,
      [id],
    );
    return rows[0] ? toRepresentation(rows[0]) : undefined;
  }

  async listForPerson(
    personId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly IdentityRepresentation[]> {
    const { rows } = await runner.query<RepresentationRow>(
      `SELECT ${COLUMNS} FROM identity_representation
        WHERE person_id = $1 ORDER BY created_at, id`,
      [personId],
    );
    return rows.map(toRepresentation);
  }

  // --- Concurrency ---------------------------------------------------------------------------

  /**
   * Bump the lens revision, but only if it still holds the value the caller read.
   *
   * The same optimistic-concurrency shape Explicit State uses for whole-set transitions: a
   * repositioning applies against the lens the user was looking at, or it is refused. Returns
   * undefined when someone else moved first.
   */
  async bumpRevision(
    tx: Transaction,
    representationId: string,
    expected: number,
  ): Promise<number | undefined> {
    const { rows } = await tx.query<{ revision: number }>(
      `UPDATE identity_representation
          SET revision = revision + 1, updated_at = now()
        WHERE id = $1 AND revision = $2
        RETURNING revision`,
      [representationId, expected],
    );
    return rows[0]?.revision;
  }

  /**
   * Upsert one decision.
   *
   * `undefined` leaves a field as it was; `null` clears it. `COALESCE` on an explicit sentinel would
   * not distinguish those, so the caller passes a flag per field and the SQL keeps the old value
   * where it is not being set.
   */
  async upsertDecision(
    tx: Transaction,
    input: {
      id: string;
      representationId: string;
      nodeId: string;
      included?: boolean;
      priority?: number | null;
      emphasis?: RepresentationEmphasis | null;
      framing?: string | null;
      decidedBy: string;
    },
  ): Promise<RepresentationDecision> {
    const { rows } = await tx.query<DecisionRow>(
      `INSERT INTO identity_representation_decision
         (id, representation_id, node_id, included, priority, emphasis, framing, decided_by)
       VALUES ($1, $2, $3, COALESCE($4, true), $5, $6, $7, $8)
       ON CONFLICT (representation_id, node_id) DO UPDATE SET
         included   = CASE WHEN $9  THEN EXCLUDED.included   ELSE identity_representation_decision.included END,
         priority   = CASE WHEN $10 THEN EXCLUDED.priority   ELSE identity_representation_decision.priority END,
         emphasis   = CASE WHEN $11 THEN EXCLUDED.emphasis   ELSE identity_representation_decision.emphasis END,
         framing    = CASE WHEN $12 THEN EXCLUDED.framing    ELSE identity_representation_decision.framing END,
         decided_at = now(),
         decided_by = EXCLUDED.decided_by
       RETURNING ${DECISION_COLUMNS}`,
      [
        input.id,
        input.representationId,
        input.nodeId,
        input.included ?? null,
        input.priority ?? null,
        input.emphasis ?? null,
        input.framing ?? null,
        input.decidedBy,
        input.included !== undefined,
        input.priority !== undefined,
        input.emphasis !== undefined,
        input.framing !== undefined,
      ],
    );
    return toDecision(rows[0]!);
  }

  async listDecisions(
    representationId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly RepresentationDecision[]> {
    const { rows } = await runner.query<DecisionRow>(
      `SELECT ${DECISION_COLUMNS} FROM identity_representation_decision
        WHERE representation_id = $1 ORDER BY decided_at, id`,
      [representationId],
    );
    return rows.map(toDecision);
  }

  /** Representation aggregates that currently hold a decision about this stable canonical ID. */
  async listRepresentationIdsForNode(nodeId: string): Promise<readonly string[]> {
    const { rows } = await this.#db.query<{ representation_id: string }>(
      `SELECT DISTINCT representation_id
         FROM identity_representation_decision
        WHERE node_id = $1 ORDER BY representation_id`,
      [nodeId],
    );
    return rows.map((row) => row.representation_id);
  }

  async deleteDecision(
    tx: Transaction,
    representationId: string,
    nodeId: string,
  ): Promise<boolean> {
    const { rowCount } = await tx.query(
      `DELETE FROM identity_representation_decision
        WHERE representation_id = $1 AND node_id = $2`,
      [representationId, nodeId],
    );
    return rowCount > 0;
  }

  async incrementRevision(tx: Transaction, representationId: string): Promise<number> {
    const { rows } = await tx.query<{ revision: number }>(
      `UPDATE identity_representation
          SET revision = revision + 1, updated_at = now()
        WHERE id = $1 RETURNING revision`,
      [representationId],
    );
    const revision = rows[0]?.revision;
    if (revision === undefined) {
      throw new Error(`No Identity Representation '${representationId}'.`);
    }
    return revision;
  }

  // --- Lens-level positioning themes -----------------------------------------------------------

  /** Replace the ordered theme list. The whole list is the unit: it is an arrangement, not a set. */
  async replaceThemes(
    tx: Transaction,
    representationId: string,
    themes: readonly { id: string; label: string }[],
  ): Promise<readonly PositioningTheme[]> {
    await tx.query('DELETE FROM identity_representation_theme WHERE representation_id = $1', [
      representationId,
    ]);

    const written: PositioningTheme[] = [];
    for (const [index, theme] of themes.entries()) {
      await tx.query(
        `INSERT INTO identity_representation_theme (id, representation_id, label, position)
         VALUES ($1, $2, $3, $4)`,
        [theme.id, representationId, theme.label, index],
      );
      written.push({ id: theme.id, label: theme.label, position: index });
    }
    return written;
  }

  async listThemes(
    representationId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly PositioningTheme[]> {
    const { rows } = await runner.query<{ id: string; label: string; position: number }>(
      `SELECT id, label, position FROM identity_representation_theme
        WHERE representation_id = $1 ORDER BY position`,
      [representationId],
    );
    return rows.map((row) => ({ id: row.id, label: row.label, position: row.position }));
  }
}
