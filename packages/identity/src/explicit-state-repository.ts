/**
 * Persistence for canonical Explicit State.
 *
 * Separate from `IdentityRepository` because what it touches is categorically different: that one
 * holds sources and proposals, none of which is true about the person. Everything here **is**.
 *
 * Every write takes a transaction. A confirmation applies a whole reviewed set or none of it, and
 * a correction changes a fact and records why, together.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  ActivityNode,
  CorrectionRecord,
  EpistemicStatus,
  ExplicitNode,
  ProvenanceRecord,
  ReconstructedState,
  RelationEdge,
  RelationKind,
  ReviewDecisionRecord,
  ReviewRecord,
  StructureKind,
  StructureNode,
} from './model';

interface NodeRow extends Record<string, unknown> {
  id: string;
  node_type: string;
  label: string;
  structure_kind: string | null;
  started_at: string | null;
  ended_at: string | null;
  contribution: string | null;
  capability: unknown;
  consequence: string | null;
  epistemic_status: string;
  revision: number;
}

interface RelationRow extends Record<string, unknown> {
  id: string;
  kind: string;
  from_node_id: string;
  to_node_id: string;
  epistemic_status: string;
  revision: number;
}

const optional = <K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> =>
  value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toNode(row: NodeRow): ExplicitNode {
  if (row.node_type === 'structure') {
    return {
      id: row.id,
      type: 'structure',
      kind: row.structure_kind as StructureKind,
      label: row.label,
      epistemicStatus: row.epistemic_status as EpistemicStatus,
      revision: row.revision,
      ...optional('startedAt', row.started_at),
      ...optional('endedAt', row.ended_at),
    } satisfies StructureNode;
  }

  const capability = Array.isArray(row.capability) ? (row.capability as string[]) : undefined;
  return {
    id: row.id,
    type: 'activity',
    label: row.label,
    epistemicStatus: row.epistemic_status as EpistemicStatus,
    revision: row.revision,
    // Absent components stay absent through the round trip. A null column must not become an
    // empty string or an empty array on the way out — that would turn "we don't know" into "none".
    ...optional('contribution', row.contribution),
    ...optional('consequence', row.consequence),
    ...(capability && capability.length > 0 ? { capability } : {}),
  } satisfies ActivityNode;
}

function toRelation(row: RelationRow): RelationEdge {
  return {
    id: row.id,
    kind: row.kind as RelationKind,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    epistemicStatus: row.epistemic_status as EpistemicStatus,
    revision: row.revision,
  };
}

const NODE_COLUMNS = `id, node_type, label, structure_kind, started_at, ended_at,
                      contribution, capability, consequence, epistemic_status, revision`;
const RELATION_COLUMNS = `id, kind, from_node_id, to_node_id, epistemic_status, revision`;

export interface NodeInput {
  readonly id: string;
  readonly personId: string;
  readonly epistemicStatus: EpistemicStatus;
  readonly label: string;
  readonly kind?: StructureKind;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly contribution?: string;
  readonly capability?: readonly string[];
  readonly consequence?: string;
}

export class ExplicitStateRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  // --- Identity revision ------------------------------------------------------------------

  async getRevision(personId: string, runner: Queryable = this.#db): Promise<number | undefined> {
    const { rows } = await runner.query<{ revision: number }>(
      'SELECT revision FROM identity_durable_identity WHERE person_id = $1',
      [personId],
    );
    return rows[0]?.revision;
  }

  /**
   * Lock the Durable Identity root while deciding whether a whole-state command is material.
   *
   * Most writers can use `bumpRevision` as their first operation. Stated Context also has
   * idempotent commands, which must not bump the revision merely to discover that nothing changed.
   * Locking first keeps that no-op decision linearizable with every other identity-wide writer.
   */
  async lockRevision(tx: Transaction, personId: string): Promise<number | undefined> {
    const { rows } = await tx.query<{ revision: number }>(
      'SELECT revision FROM identity_durable_identity WHERE person_id = $1 FOR UPDATE',
      [personId],
    );
    return rows[0]?.revision;
  }

  /**
   * Bump the identity revision, but only if it still holds the value the caller read.
   *
   * Returns the new revision, or undefined when someone else moved first — which is the whole
   * point: the losing writer must be told, not silently applied on top.
   */
  async bumpRevision(tx: Transaction, personId: string, expected: number): Promise<number | undefined> {
    const { rows } = await tx.query<{ revision: number }>(
      `UPDATE identity_durable_identity SET revision = revision + 1
        WHERE person_id = $1 AND revision = $2
        RETURNING revision`,
      [personId, expected],
    );
    return rows[0]?.revision;
  }

  /**
   * Bump unconditionally, for corrections.
   *
   * Corrections are guarded at the node they touch, not identity-wide — two people fixing two
   * different facts must not collide. The identity revision is a monotonic counter for the
   * `IdentityUpdated` payload, not the lock.
   */
  async incrementRevision(tx: Transaction, personId: string): Promise<number> {
    const { rows } = await tx.query<{ revision: number }>(
      `UPDATE identity_durable_identity SET revision = revision + 1
        WHERE person_id = $1 RETURNING revision`,
      [personId],
    );
    const revision = rows[0]?.revision;
    if (revision === undefined) throw new Error(`No durable identity for person '${personId}'`);
    return revision;
  }

  // --- Canonical nodes and relations ------------------------------------------------------

  async insertStructure(tx: Transaction, input: NodeInput): Promise<StructureNode> {
    const { rows } = await tx.query<NodeRow>(
      `INSERT INTO identity_explicit_node
         (id, person_id, node_type, label, structure_kind, started_at, ended_at, epistemic_status)
       VALUES ($1, $2, 'structure', $3, $4, $5, $6, $7)
       RETURNING ${NODE_COLUMNS}`,
      [
        input.id,
        input.personId,
        input.label,
        input.kind ?? null,
        input.startedAt ?? null,
        input.endedAt ?? null,
        input.epistemicStatus,
      ],
    );
    return toNode(rows[0]!) as StructureNode;
  }

  async insertActivity(tx: Transaction, input: NodeInput): Promise<ActivityNode> {
    const { rows } = await tx.query<NodeRow>(
      `INSERT INTO identity_explicit_node
         (id, person_id, node_type, label, contribution, capability, consequence, epistemic_status)
       VALUES ($1, $2, 'activity', $3, $4, $5::jsonb, $6, $7)
       RETURNING ${NODE_COLUMNS}`,
      [
        input.id,
        input.personId,
        input.label,
        input.contribution ?? null,
        // NULL, not '[]' — an absent capability is absent, and the CHECK constraint counts on it.
        input.capability && input.capability.length > 0 ? JSON.stringify(input.capability) : null,
        input.consequence ?? null,
        input.epistemicStatus,
      ],
    );
    return toNode(rows[0]!) as ActivityNode;
  }

  async insertRelation(
    tx: Transaction,
    input: {
      id: string;
      personId: string;
      kind: RelationKind;
      fromNodeId: string;
      toNodeId: string;
      epistemicStatus: EpistemicStatus;
    },
  ): Promise<RelationEdge> {
    const { rows } = await tx.query<RelationRow>(
      `INSERT INTO identity_relation (id, person_id, kind, from_node_id, to_node_id, epistemic_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${RELATION_COLUMNS}`,
      [input.id, input.personId, input.kind, input.fromNodeId, input.toNodeId, input.epistemicStatus],
    );
    return toRelation(rows[0]!);
  }

  async findNode(nodeId: string, runner: Queryable = this.#db): Promise<ExplicitNode | undefined> {
    const { rows } = await runner.query<NodeRow>(
      `SELECT ${NODE_COLUMNS} FROM identity_explicit_node WHERE id = $1`,
      [nodeId],
    );
    return rows[0] ? toNode(rows[0]) : undefined;
  }

  async findNodeOwner(nodeId: string, runner: Queryable = this.#db): Promise<string | undefined> {
    const { rows } = await runner.query<{ person_id: string }>(
      'SELECT person_id FROM identity_explicit_node WHERE id = $1',
      [nodeId],
    );
    return rows[0]?.person_id;
  }

  /** Stable canonical IDs belonging to one person; no fact content crosses the boundary. */
  async listOwnedNodeIds(
    personId: string,
    nodeIds: readonly string[],
    runner: Queryable = this.#db,
  ): Promise<readonly string[]> {
    if (nodeIds.length === 0) return [];
    const { rows } = await runner.query<{ id: string }>(
      'SELECT id FROM identity_explicit_node WHERE person_id = $1 AND id = ANY($2::text[])',
      [personId, [...nodeIds]],
    );
    return rows.map((row) => row.id);
  }

  /**
   * Update a node, guarded by its own revision.
   *
   * Fine-grained on purpose: two corrections to two different facts must not conflict, and an
   * identity-wide lock would make them do so.
   */
  async updateNode(
    tx: Transaction,
    nodeId: string,
    expectedRevision: number,
    fields: {
      label?: string;
      startedAt?: string | null;
      endedAt?: string | null;
      contribution?: string | null;
      capability?: readonly string[] | null;
      consequence?: string | null;
      epistemicStatus?: EpistemicStatus;
    },
  ): Promise<ExplicitNode | undefined> {
    const assignments: string[] = [];
    const params: unknown[] = [nodeId, expectedRevision];

    const set = (column: string, value: unknown, cast = ''): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}${cast}`);
    };

    if (fields.label !== undefined) set('label', fields.label);
    if (fields.startedAt !== undefined) set('started_at', fields.startedAt);
    if (fields.endedAt !== undefined) set('ended_at', fields.endedAt);
    if (fields.contribution !== undefined) set('contribution', fields.contribution);
    if (fields.consequence !== undefined) set('consequence', fields.consequence);
    if (fields.capability !== undefined) {
      set(
        'capability',
        fields.capability && fields.capability.length > 0 ? JSON.stringify(fields.capability) : null,
        '::jsonb',
      );
    }
    if (fields.epistemicStatus !== undefined) set('epistemic_status', fields.epistemicStatus);

    if (assignments.length === 0) return this.findNode(nodeId, tx);

    const { rows } = await tx.query<NodeRow>(
      `UPDATE identity_explicit_node
          SET ${assignments.join(', ')}, revision = revision + 1, updated_at = now()
        WHERE id = $1 AND revision = $2
        RETURNING ${NODE_COLUMNS}`,
      params,
    );
    return rows[0] ? toNode(rows[0]) : undefined;
  }

  /** Removing a node cascades to its relations — an edge to a removed node claims nothing. */
  async deleteNode(tx: Transaction, nodeId: string, expectedRevision: number): Promise<boolean> {
    const { rowCount } = await tx.query(
      'DELETE FROM identity_explicit_node WHERE id = $1 AND revision = $2',
      [nodeId, expectedRevision],
    );
    return rowCount > 0;
  }

  async findRelationsFor(nodeId: string, runner: Queryable = this.#db): Promise<readonly RelationEdge[]> {
    const { rows } = await runner.query<RelationRow>(
      `SELECT ${RELATION_COLUMNS} FROM identity_relation WHERE from_node_id = $1 OR to_node_id = $1`,
      [nodeId],
    );
    return rows.map(toRelation);
  }

  async deleteRelation(tx: Transaction, relationId: string): Promise<boolean> {
    const { rowCount } = await tx.query('DELETE FROM identity_relation WHERE id = $1', [relationId]);
    return rowCount > 0;
  }

  // --- Reads -------------------------------------------------------------------------------

  async getReconstructedState(personId: string, runner: Queryable = this.#db): Promise<ReconstructedState> {
    const nodes = await runner.query<NodeRow>(
      `SELECT ${NODE_COLUMNS} FROM identity_explicit_node WHERE person_id = $1 ORDER BY created_at, id`,
      [personId],
    );
    const relations = await runner.query<RelationRow>(
      `SELECT ${RELATION_COLUMNS} FROM identity_relation WHERE person_id = $1 ORDER BY created_at, id`,
      [personId],
    );

    const structure: StructureNode[] = [];
    const activities: ActivityNode[] = [];
    for (const row of nodes.rows) {
      const node = toNode(row);
      if (node.type === 'structure') structure.push(node);
      else activities.push(node);
    }

    return { structure, activities, relations: relations.rows.map(toRelation) };
  }

  // --- Provenance ---------------------------------------------------------------------------

  async insertProvenance(
    tx: Transaction,
    record: {
      id: string;
      personId: string;
      subjectType: 'node' | 'relation';
      subjectId: string;
      origin: ProvenanceRecord['origin'];
      sourceId?: string;
      proposalId?: string;
      proposalItemId?: string;
      quote?: string;
      startOffset?: number;
      endOffset?: number;
      recordedBy: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO identity_provenance
         (id, person_id, subject_type, subject_id, origin, source_id, proposal_id, proposal_item_id,
          quote, start_offset, end_offset, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.id,
        record.personId,
        record.subjectType,
        record.subjectId,
        record.origin,
        record.sourceId ?? null,
        record.proposalId ?? null,
        record.proposalItemId ?? null,
        record.quote ?? null,
        record.startOffset ?? null,
        record.endOffset ?? null,
        record.recordedBy,
      ],
    );
  }

  async findProvenance(
    subjectType: 'node' | 'relation',
    subjectId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly ProvenanceRecord[]> {
    const { rows } = await runner.query<Record<string, unknown>>(
      `SELECT id, subject_type, subject_id, origin, source_id, proposal_id, proposal_item_id,
              quote, start_offset, end_offset, recorded_at, recorded_by
         FROM identity_provenance
        WHERE subject_type = $1 AND subject_id = $2
        ORDER BY recorded_at`,
      [subjectType, subjectId],
    );

    return rows.map((row) => ({
      id: row.id as string,
      subjectType: row.subject_type as 'node' | 'relation',
      subjectId: row.subject_id as string,
      origin: row.origin as ProvenanceRecord['origin'],
      recordedAt: iso(row.recorded_at as string),
      recordedBy: row.recorded_by as string,
      ...optional('sourceId', row.source_id as string | null),
      ...optional('proposalId', row.proposal_id as string | null),
      ...optional('proposalItemId', row.proposal_item_id as string | null),
      ...optional('quote', row.quote as string | null),
      ...optional('startOffset', row.start_offset as number | null),
      ...optional('endOffset', row.end_offset as number | null),
    }));
  }

  // --- Review and correction history ---------------------------------------------------------

  async insertReview(
    tx: Transaction,
    review: { id: string; personId: string; proposalId: string; revision: number; confirmedBy: string },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO identity_review (id, person_id, proposal_id, revision, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [review.id, review.personId, review.proposalId, review.revision, review.confirmedBy],
    );
  }

  async insertReviewDecision(
    tx: Transaction,
    decision: {
      id: string;
      reviewId: string;
      proposalItemId?: string;
      decision: ReviewDecisionRecord['decision'];
      proposed?: unknown;
      edited?: unknown;
      appliedType?: 'node' | 'relation';
      appliedId?: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO identity_review_decision
         (id, review_id, proposal_item_id, decision, proposed, edited, applied_type, applied_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        decision.id,
        decision.reviewId,
        decision.proposalItemId ?? null,
        decision.decision,
        decision.proposed === undefined ? null : JSON.stringify(decision.proposed),
        decision.edited === undefined ? null : JSON.stringify(decision.edited),
        decision.appliedType ?? null,
        decision.appliedId ?? null,
      ],
    );
  }

  async findReviewByProposal(proposalId: string, runner: Queryable = this.#db): Promise<ReviewRecord | undefined> {
    const { rows } = await runner.query<Record<string, unknown>>(
      `SELECT id, person_id, proposal_id, revision, confirmed_at, confirmed_by
         FROM identity_review WHERE proposal_id = $1`,
      [proposalId],
    );
    const row = rows[0];
    if (!row) return undefined;

    const decisions = await runner.query<Record<string, unknown>>(
      `SELECT id, proposal_item_id, decision, proposed, edited, applied_type, applied_id
         FROM identity_review_decision WHERE review_id = $1 ORDER BY id`,
      [row.id as string],
    );

    return {
      id: row.id as string,
      personId: row.person_id as string,
      proposalId: row.proposal_id as string,
      revision: row.revision as number,
      confirmedAt: iso(row.confirmed_at as string),
      confirmedBy: row.confirmed_by as string,
      decisions: decisions.rows.map((d) => ({
        id: d.id as string,
        decision: d.decision as ReviewDecisionRecord['decision'],
        ...optional('proposalItemId', d.proposal_item_id as string | null),
        ...optional('proposed', d.proposed),
        ...optional('edited', d.edited),
        ...optional('appliedType', d.applied_type as 'node' | 'relation' | null),
        ...optional('appliedId', d.applied_id as string | null),
      })),
    };
  }

  async markProposalConfirmed(tx: Transaction, proposalId: string): Promise<void> {
    await tx.query(`UPDATE identity_reconstruction_proposal SET status = 'confirmed' WHERE id = $1`, [
      proposalId,
    ]);
  }

  async insertCorrection(
    tx: Transaction,
    correction: {
      id: string;
      personId: string;
      subjectType: 'node' | 'relation';
      subjectId: string;
      operation: 'add' | 'update' | 'remove';
      before?: unknown;
      after?: unknown;
      correctedBy: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO identity_correction
         (id, person_id, subject_type, subject_id, operation, before, after, corrected_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [
        correction.id,
        correction.personId,
        correction.subjectType,
        correction.subjectId,
        correction.operation,
        correction.before === undefined ? null : JSON.stringify(correction.before),
        correction.after === undefined ? null : JSON.stringify(correction.after),
        correction.correctedBy,
      ],
    );
  }

  async listCorrections(personId: string): Promise<readonly CorrectionRecord[]> {
    const { rows } = await this.#db.query<Record<string, unknown>>(
      `SELECT id, subject_type, subject_id, operation, before, after, corrected_at, corrected_by
         FROM identity_correction WHERE person_id = $1 ORDER BY corrected_at DESC, id`,
      [personId],
    );

    return rows.map((row) => ({
      id: row.id as string,
      subjectType: row.subject_type as 'node' | 'relation',
      subjectId: row.subject_id as string,
      operation: row.operation as 'add' | 'update' | 'remove',
      correctedAt: iso(row.corrected_at as string),
      correctedBy: row.corrected_by as string,
      ...optional('before', row.before),
      ...optional('after', row.after),
    }));
  }
}
