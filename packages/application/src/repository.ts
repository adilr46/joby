/**
 * Application's persistence. The only code that touches `application*` tables.
 *
 * Transactions are passed in, never opened here, for the same reason Opportunity's repository does
 * it: creating an application and recording its lineage have to commit together.
 *
 * **Immutable where the model says so.** No UPDATE exists for submitted material, timeline entries,
 * communications, interview stages or outcomes — every one of those is append-only, and a correction
 * is a new row, never a rewrite of an old one.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  AdaptationProduced,
  Application,
  ApplicationRecord,
  Communication,
  CommunicationDirection,
  InterviewStage,
  InterviewStageKind,
  ApplicationOutcomeType,
  OpportunityStateUsed,
  OutcomeKind,
  PersonStateUsed,
  RepresentationPriorUsed,
  ResolvedOutcome,
  SubmittedMaterial,
  SubmittedMaterialKind,
  SubmittedReality,
  TimelineEntry,
  TimelineStage,
} from './model';

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

// --- Row shapes -------------------------------------------------------------------------------

interface ApplicationRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  opportunity_id: string;
  external_details: Application['externalDetails'] | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LineageRow extends Record<string, unknown> {
  application_id: string;
  grounding_profile_unit_ids: string[];
  identity_revision: number | null;
  user_context_used: PersonStateUsed['userContextUsed'] | null;
  opportunity_revision: number | null;
  recommended_representation_id: string | null;
  selected_representation_id: string | null;
  representation_revision: number | null;
  adaptation_context_id: string | null;
  draft_ids: string[];
}

interface SubmittedMaterialRow extends Record<string, unknown> {
  id: string;
  kind: string;
  content: string | null;
  source_draft_id: string | null;
  edited_from_source: boolean;
  submitted_at: Date | string;
}

interface TimelineRow extends Record<string, unknown> {
  id: string;
  stage: string;
  occurred_at: Date | string;
  note: string | null;
  supersedes: string | null;
  recorded_at: Date | string;
  recorded_by: string;
}

interface CommunicationRow extends Record<string, unknown> {
  id: string;
  direction: string;
  channel: string;
  summary: string;
  occurred_at: Date | string;
  recorded_at: Date | string;
}

interface InterviewStageRow extends Record<string, unknown> {
  id: string;
  kind: string;
  occurred_at: Date | string | null;
  observations: string[];
  reflection: string | null;
  recorded_at: Date | string;
}

interface OutcomeRow extends Record<string, unknown> {
  id: string;
  kind: string;
  canonical_type: string | null;
  occurred_at: Date | string;
  note: string | null;
  feedback: string | null;
  recorded_at: Date | string;
}

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    personId: row.person_id,
    ...(row.external_details ? { externalDetails: row.external_details } : {}),
    opportunityId: row.opportunity_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toPersonState(row: LineageRow): PersonStateUsed {
  return {
    groundingProfileUnitIds: row.grounding_profile_unit_ids,
    identityRevision: row.identity_revision,
    ...(row.user_context_used ? { userContextUsed: row.user_context_used } : {}),
  };
}

function toOpportunityState(row: LineageRow, opportunityId: string): OpportunityStateUsed {
  return { opportunityId, opportunityRevision: row.opportunity_revision };
}

function toRepresentation(row: LineageRow): RepresentationPriorUsed {
  return {
    ...(row.recommended_representation_id
      ? { recommendedRepresentationId: row.recommended_representation_id }
      : {}),
    ...(row.selected_representation_id
      ? { selectedRepresentationId: row.selected_representation_id }
      : {}),
    ...(row.representation_revision !== null
      ? { representationRevision: row.representation_revision }
      : {}),
  };
}

function toAdaptation(row: LineageRow): AdaptationProduced {
  return {
    ...(row.adaptation_context_id ? { adaptationContextId: row.adaptation_context_id } : {}),
    draftIds: row.draft_ids,
  };
}

function toSubmittedMaterial(row: SubmittedMaterialRow): SubmittedMaterial {
  return {
    id: row.id,
    kind: row.kind as SubmittedMaterialKind,
    ...(row.content !== null ? { content: row.content } : {}),
    ...(row.source_draft_id ? { sourceDraftId: row.source_draft_id } : {}),
    editedFromSource: row.edited_from_source,
  };
}

function toTimelineEntry(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    stage: row.stage as TimelineStage,
    occurredAt: iso(row.occurred_at),
    ...(row.note ? { note: row.note } : {}),
    ...(row.supersedes ? { supersedes: row.supersedes } : {}),
    recordedAt: iso(row.recorded_at),
    recordedBy: row.recorded_by,
  };
}

function toCommunication(row: CommunicationRow): Communication {
  return {
    id: row.id,
    direction: row.direction as CommunicationDirection,
    channel: row.channel,
    summary: row.summary,
    occurredAt: iso(row.occurred_at),
    recordedAt: iso(row.recorded_at),
  };
}

function toInterviewStage(row: InterviewStageRow): InterviewStage {
  return {
    id: row.id,
    kind: row.kind as InterviewStageKind,
    ...(row.occurred_at ? { occurredAt: iso(row.occurred_at) } : {}),
    observations: row.observations,
    ...(row.reflection ? { reflection: row.reflection } : {}),
    recordedAt: iso(row.recorded_at),
  };
}

function toOutcome(row: OutcomeRow): ResolvedOutcome {
  return {
    id: row.id,
    kind: row.kind as OutcomeKind,
    ...(row.canonical_type ? { canonicalType: row.canonical_type as ApplicationOutcomeType } : {}),
    occurredAt: iso(row.occurred_at),
    ...(row.note ? { note: row.note } : {}),
    ...(row.feedback ? { feedback: row.feedback } : {}),
    recordedAt: iso(row.recorded_at),
  };
}

export class ApplicationRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  // --- Root + lineage, created together ---------------------------------------------------------

  async insert(
    tx: Transaction,
    input: {
      id: string;
      personId: string;
      opportunityId: string;
      personState: PersonStateUsed;
      opportunityState: OpportunityStateUsed;
      representation: RepresentationPriorUsed;
      adaptation: AdaptationProduced;
      externalDetails?: Application['externalDetails'];
    },
  ): Promise<Application> {
    const { rows } = await tx.query<ApplicationRow>(
      `INSERT INTO application (id, person_id, opportunity_id, external_details)
       VALUES ($1, $2, $3, $4)
       RETURNING id, person_id, opportunity_id, external_details, created_at, updated_at`,
      [input.id, input.personId, input.opportunityId, input.externalDetails ? JSON.stringify(input.externalDetails) : null],
    );

    await tx.query(
      `INSERT INTO application_lineage
         (application_id, grounding_profile_unit_ids, identity_revision, user_context_used,
          opportunity_revision, recommended_representation_id, selected_representation_id,
          representation_revision, adaptation_context_id, draft_ids)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)`,
      [
        input.id,
        [...input.personState.groundingProfileUnitIds],
        input.personState.identityRevision,
        input.personState.userContextUsed ? JSON.stringify(input.personState.userContextUsed) : null,
        input.opportunityState.opportunityRevision,
        input.representation.recommendedRepresentationId ?? null,
        input.representation.selectedRepresentationId ?? null,
        input.representation.representationRevision ?? null,
        input.adaptation.adaptationContextId ?? null,
        [...input.adaptation.draftIds],
      ],
    );

    return toApplication(rows[0]!);
  }

  async findApplication(id: string, executor: Queryable = this.#db): Promise<Application | undefined> {
    const { rows } = await executor.query<ApplicationRow>(
      `SELECT id, person_id, opportunity_id, external_details, created_at, updated_at FROM application WHERE id = $1`,
      [id],
    );
    return rows[0] ? toApplication(rows[0]) : undefined;
  }

  async findByPersonAndOpportunity(
    personId: string,
    opportunityId: string,
    executor: Queryable = this.#db,
  ): Promise<Application | undefined> {
    const { rows } = await executor.query<ApplicationRow>(
      `SELECT id, person_id, opportunity_id, external_details, created_at, updated_at
         FROM application WHERE person_id = $1 AND opportunity_id = $2`,
      [personId, opportunityId],
    );
    return rows[0] ? toApplication(rows[0]) : undefined;
  }

  async listForPerson(personId: string, executor: Queryable = this.#db): Promise<readonly Application[]> {
    const { rows } = await executor.query<ApplicationRow>(
      `SELECT id, person_id, opportunity_id, external_details, created_at, updated_at
         FROM application WHERE person_id = $1 ORDER BY created_at`,
      [personId],
    );
    return rows.map(toApplication);
  }

  /**
   * `opportunityId` is supplied by the caller — always the application row's own — rather than
   * re-derived here, because the lineage table has no opportunity id column of its own to guess
   * from and should not grow one merely to avoid a parameter.
   */
  async findLineage(
    applicationId: string,
    opportunityId: string,
    executor: Queryable = this.#db,
  ): Promise<
    | { personState: PersonStateUsed; opportunityState: OpportunityStateUsed;
        representation: RepresentationPriorUsed; adaptation: AdaptationProduced }
    | undefined
  > {
    const { rows } = await executor.query<LineageRow>(
      `SELECT * FROM application_lineage WHERE application_id = $1`,
      [applicationId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      personState: toPersonState(row),
      opportunityState: toOpportunityState(row, opportunityId),
      representation: toRepresentation(row),
      adaptation: toAdaptation(row),
    };
  }

  // --- X_n — submitted reality, immutable -------------------------------------------------------

  async insertSubmittedMaterial(
    tx: Transaction,
    applicationId: string,
    material: SubmittedMaterial,
    submittedAt: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO application_submitted_material
         (id, application_id, kind, content, source_draft_id, edited_from_source, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        material.id,
        applicationId,
        material.kind,
        material.content ?? null,
        material.sourceDraftId ?? null,
        material.editedFromSource,
        submittedAt,
      ],
    );
  }

  async listSubmittedMaterial(
    applicationId: string,
    executor: Queryable = this.#db,
  ): Promise<{ materials: readonly SubmittedMaterial[]; submittedAt?: string }> {
    const { rows } = await executor.query<SubmittedMaterialRow>(
      `SELECT id, kind, content, source_draft_id, edited_from_source, submitted_at
         FROM application_submitted_material
        WHERE application_id = $1
        ORDER BY submitted_at, id`,
      [applicationId],
    );
    return {
      materials: rows.map(toSubmittedMaterial),
      ...(rows[0] ? { submittedAt: iso(rows[0].submitted_at) } : {}),
    };
  }

  // --- I_n — interaction history, append-only -----------------------------------------------------

  async insertTimelineEntry(
    tx: Transaction | Database,
    applicationId: string,
    entry: TimelineEntry,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO application_timeline_entry
         (id, application_id, stage, occurred_at, note, supersedes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.id,
        applicationId,
        entry.stage,
        entry.occurredAt,
        entry.note ?? null,
        entry.supersedes ?? null,
        entry.recordedBy,
      ],
    );
  }

  async listTimeline(applicationId: string, executor: Queryable = this.#db): Promise<readonly TimelineEntry[]> {
    const { rows } = await executor.query<TimelineRow>(
      `SELECT id, stage, occurred_at, note, supersedes, recorded_at, recorded_by
         FROM application_timeline_entry
        WHERE application_id = $1
        ORDER BY occurred_at, recorded_at`,
      [applicationId],
    );
    return rows.map(toTimelineEntry);
  }

  async insertCommunication(
    tx: Transaction | Database,
    applicationId: string,
    communication: Communication,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO application_communication (id, application_id, direction, channel, summary, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [communication.id, applicationId, communication.direction, communication.channel, communication.summary, communication.occurredAt],
    );
  }

  async listCommunications(
    applicationId: string,
    executor: Queryable = this.#db,
  ): Promise<readonly Communication[]> {
    const { rows } = await executor.query<CommunicationRow>(
      `SELECT id, direction, channel, summary, occurred_at, recorded_at
         FROM application_communication WHERE application_id = $1 ORDER BY occurred_at`,
      [applicationId],
    );
    return rows.map(toCommunication);
  }

  async insertInterviewStage(
    tx: Transaction | Database,
    applicationId: string,
    stage: InterviewStage,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO application_interview_stage (id, application_id, kind, occurred_at, observations, reflection)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [stage.id, applicationId, stage.kind, stage.occurredAt ?? null, [...stage.observations], stage.reflection ?? null],
    );
  }

  /**
   * The one update path in this module: attaching a reflection to a stage already recorded.
   *
   * Scoped by `applicationId` as well as `stageId` — the same defence-in-depth every other method
   * here applies, so a stage id from one application can never be used to write into another's
   * history.
   */
  async setInterviewReflection(
    tx: Transaction | Database,
    applicationId: string,
    stageId: string,
    reflection: string,
  ): Promise<boolean> {
    const { rowCount } = await tx.query(
      `UPDATE application_interview_stage SET reflection = $3
        WHERE id = $2 AND application_id = $1`,
      [applicationId, stageId, reflection],
    );
    return rowCount > 0;
  }

  /** Which application a stage belongs to, so a caller holding only a stage id can find it. */
  async findApplicationIdForInterviewStage(
    stageId: string,
    executor: Queryable = this.#db,
  ): Promise<string | undefined> {
    const { rows } = await executor.query<{ application_id: string }>(
      `SELECT application_id FROM application_interview_stage WHERE id = $1`,
      [stageId],
    );
    return rows[0]?.application_id;
  }

  async listInterviewStages(
    applicationId: string,
    executor: Queryable = this.#db,
  ): Promise<readonly InterviewStage[]> {
    const { rows } = await executor.query<InterviewStageRow>(
      `SELECT id, kind, occurred_at, observations, reflection, recorded_at
         FROM application_interview_stage WHERE application_id = $1 ORDER BY recorded_at`,
      [applicationId],
    );
    return rows.map(toInterviewStage);
  }

  // --- Y_n — resolved outcomes, append-only -----------------------------------------------------

  async insertOutcome(tx: Transaction | Database, applicationId: string, outcome: ResolvedOutcome): Promise<void> {
    await tx.query(
      `INSERT INTO application_outcome
         (id, application_id, kind, canonical_type, occurred_at, note, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        outcome.id,
        applicationId,
        outcome.kind,
        outcome.canonicalType ?? null,
        outcome.occurredAt,
        outcome.note ?? null,
        outcome.feedback ?? null,
      ],
    );
  }

  async listOutcomes(applicationId: string, executor: Queryable = this.#db): Promise<readonly ResolvedOutcome[]> {
    const { rows } = await executor.query<OutcomeRow>(
      `SELECT id, kind, canonical_type, occurred_at, note, feedback, recorded_at
         FROM application_outcome WHERE application_id = $1 ORDER BY occurred_at`,
      [applicationId],
    );
    return rows.map(toOutcome);
  }

  /** `updated_at` bumps whenever any append happens, so a list view can sort by recent activity. */
  async touch(tx: Transaction | Database, applicationId: string): Promise<void> {
    await tx.query(`UPDATE application SET updated_at = now() WHERE id = $1`, [applicationId]);
  }
}

