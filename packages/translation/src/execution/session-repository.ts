/**
 * Application Session persistence. The only code that touches `execution_session`.
 *
 * A transaction is accepted where a caller might want to compose this write with another, but every
 * method also runs standalone: unlike Opportunity or Application, a session's writes are not part of
 * a larger multi-table transaction by design — one row is the whole of its durable state.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type { ApplicationIntent } from './information-seams';
import type {
  ApplicationSession,
  ExecutionLevel,
  JobContext,
  PortalContext,
  SessionMemory,
  SessionRequirement,
  WorkingApplicationState,
} from './session';

interface SessionRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  opportunity_id: string;
  application_id: string | null;
  opportunity_revision: number;
  role: string | null;
  company: string | null;
  portal_kind: string | null;
  current_step_id: string | null;
  intent: ApplicationIntent | null;
  portal_field_values: Record<string, string>;
  execution_level: string;
  paused: boolean;
  requirements: SessionRequirement[];
  memory: SessionMemory;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = `id, person_id, opportunity_id, application_id, opportunity_revision, role, company,
                 portal_kind, current_step_id, intent, portal_field_values, execution_level, paused,
                 requirements, memory, created_at, updated_at`;

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toSession(row: SessionRow): ApplicationSession {
  const jobContext: JobContext = {
    opportunityId: row.opportunity_id,
    opportunityRevision: row.opportunity_revision,
    ...(row.role ? { role: row.role } : {}),
    ...(row.company ? { company: row.company } : {}),
  };
  const portalContext: PortalContext = {
    ...(row.portal_kind ? { portalKind: row.portal_kind } : {}),
    ...(row.current_step_id ? { currentStepId: row.current_step_id } : {}),
  };
  const workingState: WorkingApplicationState = {
    ...(row.intent ? { intent: row.intent } : {}),
    portalFieldValues: row.portal_field_values ?? {},
  };

  return {
    id: row.id,
    personId: row.person_id,
    opportunityId: row.opportunity_id,
    ...(row.application_id ? { applicationId: row.application_id } : {}),
    jobContext,
    portalContext,
    workingState,
    executionLevel: row.execution_level as ExecutionLevel,
    paused: row.paused,
    requirements: row.requirements ?? [],
    memory: row.memory ?? { notes: [] },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class ApplicationSessionRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async insert(
    executor: Queryable,
    input: {
      id: string;
      personId: string;
      opportunityId: string;
      applicationId?: string;
      jobContext: JobContext;
      requirements: readonly SessionRequirement[];
    },
  ): Promise<ApplicationSession> {
    const { rows } = await executor.query<SessionRow>(
      `INSERT INTO execution_session
         (id, person_id, opportunity_id, application_id, opportunity_revision, role, company, requirements)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.personId,
        input.opportunityId,
        input.applicationId ?? null,
        input.jobContext.opportunityRevision,
        input.jobContext.role ?? null,
        input.jobContext.company ?? null,
        JSON.stringify(input.requirements),
      ],
    );
    return toSession(rows[0]!);
  }

  async find(id: string, executor: Queryable = this.#db): Promise<ApplicationSession | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `SELECT ${COLUMNS} FROM execution_session WHERE id = $1`,
      [id],
    );
    return rows[0] ? toSession(rows[0]) : undefined;
  }

  async findByPersonAndOpportunity(
    personId: string,
    opportunityId: string,
    executor: Queryable = this.#db,
  ): Promise<ApplicationSession | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `SELECT ${COLUMNS} FROM execution_session WHERE person_id = $1 AND opportunity_id = $2`,
      [personId, opportunityId],
    );
    return rows[0] ? toSession(rows[0]) : undefined;
  }

  async listForPerson(personId: string, executor: Queryable = this.#db): Promise<readonly ApplicationSession[]> {
    const { rows } = await executor.query<SessionRow>(
      `SELECT ${COLUMNS} FROM execution_session WHERE person_id = $1 ORDER BY updated_at DESC`,
      [personId],
    );
    return rows.map(toSession);
  }

  /**
   * One general-purpose update, rather than one method per field.
   *
   * A session has no append-only history the way Application does — it is one mutable row
   * representing current attempt state, and that is the correct shape for something explicitly
   * temporary. `undefined` in any field below means "leave unchanged"; there is no way to express
   * "clear this field" here yet because nothing in this slice needs one.
   */
  async update(
    executor: Queryable | Transaction,
    id: string,
    patch: {
      applicationId?: string;
      portalContext?: PortalContext;
      workingState?: WorkingApplicationState;
      executionLevel?: ExecutionLevel;
      paused?: boolean;
      requirements?: readonly SessionRequirement[];
      memory?: SessionMemory;
    },
  ): Promise<ApplicationSession | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `UPDATE execution_session SET
         updated_at           = now(),
         application_id       = coalesce($2, application_id),
         portal_kind          = coalesce($3, portal_kind),
         current_step_id      = coalesce($4, current_step_id),
         intent               = coalesce($5::jsonb, intent),
         portal_field_values  = coalesce($6::jsonb, portal_field_values),
         execution_level      = coalesce($7, execution_level),
         paused               = coalesce($8, paused),
         requirements         = coalesce($9::jsonb, requirements),
         memory               = coalesce($10::jsonb, memory)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        patch.applicationId ?? null,
        patch.portalContext?.portalKind ?? null,
        patch.portalContext?.currentStepId ?? null,
        patch.workingState?.intent !== undefined ? JSON.stringify(patch.workingState.intent) : null,
        patch.workingState ? JSON.stringify(patch.workingState.portalFieldValues) : null,
        patch.executionLevel ?? null,
        patch.paused ?? null,
        patch.requirements ? JSON.stringify(patch.requirements) : null,
        patch.memory ? JSON.stringify(patch.memory) : null,
      ],
    );
    return rows[0] ? toSession(rows[0]) : undefined;
  }
}
