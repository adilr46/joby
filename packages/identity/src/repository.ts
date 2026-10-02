/**
 * Identity's persistence. The only code that touches `identity_*` tables.
 *
 * Transactions are passed in explicitly, never opened here: source capture and job scheduling must
 * commit together, and that is only guaranteeable if the caller owns the transaction.
 *
 * There is **no update path for a captured source**. That is the immutability rule expressed as an
 * absence rather than a comment — you cannot overwrite what has no setter.
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  GitHubConnection,
  Person,
  ProfessionalSource,
  ProposalStatus,
  ReconstructionJob,
  ReconstructionTrigger,
  RepositorySelection,
  SourceVisibility,
  ReconstructionJobStatus,
  ReconstructionProposal,
  ReconstructionProposalContent,
  SourceKind,
} from './model';

interface PersonRow extends Record<string, unknown> {
  person_id: string;
  durable_identity_id: string;
  created_at: Date | string;
}

interface SourceRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  kind: string;
  content_type: string;
  filename: string | null;
  byte_size: number;
  checksum: string;
  visibility: string;
  external_ref: string | null;
  source_version: string | null;
  captured_at: Date | string;
}

const SOURCE_COLUMNS = `id, person_id, kind, content_type, filename, byte_size, checksum,
                        visibility, external_ref, source_version, captured_at`;

interface JobRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  source_id: string;
  trigger: string;
  status: string;
  attempts: number;
  claimed_at: Date | string | null;
  completed_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
}

interface ProposalRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  source_id: string;
  job_id: string;
  status: string;
  extractor: string;
  model: string;
  proposal: unknown;
  generated_at: Date | string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const optional = <K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> =>
  value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);

function toSource(row: SourceRow): ProfessionalSource {
  return {
    id: row.id,
    personId: row.person_id,
    kind: row.kind as SourceKind,
    contentType: row.content_type,
    byteSize: row.byte_size,
    checksum: row.checksum,
    visibility: row.visibility as SourceVisibility,
    capturedAt: iso(row.captured_at),
    ...optional('filename', row.filename),
    ...optional('externalRef', row.external_ref),
    ...optional('sourceVersion', row.source_version),
  };
}

function toJob(row: JobRow): ReconstructionJob {
  return {
    id: row.id,
    personId: row.person_id,
    sourceId: row.source_id,
    trigger: row.trigger as ReconstructionJob['trigger'],
    status: row.status as ReconstructionJobStatus,
    attempts: row.attempts,
    createdAt: iso(row.created_at),
    ...optional('claimedAt', row.claimed_at ? iso(row.claimed_at) : null),
    ...optional('completedAt', row.completed_at ? iso(row.completed_at) : null),
    ...optional('lastError', row.last_error),
  };
}

function toProposal(row: ProposalRow): ReconstructionProposal {
  return {
    id: row.id,
    personId: row.person_id,
    sourceId: row.source_id,
    jobId: row.job_id,
    status: row.status as ProposalStatus,
    extractor: row.extractor,
    model: row.model,
    content: row.proposal as ReconstructionProposalContent,
    generatedAt: iso(row.generated_at),
  };
}

export class IdentityRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  // --- Person and Durable Identity root ---------------------------------------------------

  /** Create the Person and its Durable Identity root together. Unclaimed (ADR 0010). */
  async createPerson(tx: Transaction, personId: string, durableIdentityId: string): Promise<Person> {
    const { rows } = await tx.query<PersonRow>(
      `WITH new_person AS (
         INSERT INTO identity_person (id) VALUES ($1) RETURNING id, created_at
       ), new_identity AS (
         INSERT INTO identity_durable_identity (id, person_id) VALUES ($2, $1) RETURNING id, person_id
       )
       SELECT new_person.id AS person_id, new_identity.id AS durable_identity_id, new_person.created_at
         FROM new_person, new_identity`,
      [personId, durableIdentityId],
    );

    const row = rows[0];
    if (!row) throw new Error('Failed to create person');
    return { id: row.person_id, durableIdentityId: row.durable_identity_id, createdAt: iso(row.created_at) };
  }

  async findPerson(personId: string, runner: Queryable = this.#db): Promise<Person | undefined> {
    const { rows } = await runner.query<PersonRow>(
      `SELECT p.id AS person_id, d.id AS durable_identity_id, p.created_at
         FROM identity_person p
         JOIN identity_durable_identity d ON d.person_id = p.id
        WHERE p.id = $1`,
      [personId],
    );
    const row = rows[0];
    return row
      ? { id: row.person_id, durableIdentityId: row.durable_identity_id, createdAt: iso(row.created_at) }
      : undefined;
  }

  // --- Professional sources ---------------------------------------------------------------

  async insertSource(
    tx: Transaction,
    source: {
      id: string;
      personId: string;
      kind: SourceKind;
      contentType: string;
      filename?: string;
      content: Buffer;
      extractedText?: Buffer;
      checksum: string;
      /** Defaults to private. Public must be asserted, never assumed. */
      visibility?: SourceVisibility;
      externalRef?: string;
      sourceVersion?: string;
    },
  ): Promise<ProfessionalSource> {
    const { rows } = await tx.query<SourceRow>(
      `INSERT INTO identity_professional_source
         (id, person_id, kind, content_type, filename, content, extracted_text, byte_size, checksum,
          visibility, external_ref, source_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SOURCE_COLUMNS}`,
      [
        source.id,
        source.personId,
        source.kind,
        source.contentType,
        source.filename ?? null,
        source.content,
        source.extractedText ?? null,
        source.content.byteLength,
        source.checksum,
        source.visibility ?? 'private',
        source.externalRef ?? null,
        source.sourceVersion ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to insert professional source');
    return toSource(row);
  }

  /** Re-uploading the same bytes is the same source, not a new one. */
  async findSourceByChecksum(
    personId: string,
    checksum: string,
    runner: Queryable = this.#db,
  ): Promise<ProfessionalSource | undefined> {
    const { rows } = await runner.query<SourceRow>(
      `SELECT ${SOURCE_COLUMNS} FROM identity_professional_source WHERE person_id = $1 AND checksum = $2`,
      [personId, checksum],
    );
    return rows[0] ? toSource(rows[0]) : undefined;
  }

  /**
   * The latest capture of one external source, e.g. a GitHub repository.
   *
   * A refresh compares against this: an unchanged version does no work, which is what stops
   * re-ingestion manufacturing churn over material that has not moved.
   */
  async findLatestSourceByExternalRef(
    personId: string,
    kind: SourceKind,
    externalRef: string,
    runner: Queryable = this.#db,
  ): Promise<ProfessionalSource | undefined> {
    const { rows } = await runner.query<SourceRow>(
      `SELECT ${SOURCE_COLUMNS} FROM identity_professional_source
        WHERE person_id = $1 AND kind = $2 AND external_ref = $3
        ORDER BY captured_at DESC LIMIT 1`,
      [personId, kind, externalRef],
    );
    return rows[0] ? toSource(rows[0]) : undefined;
  }

  async findSource(sourceId: string, runner: Queryable = this.#db): Promise<ProfessionalSource | undefined> {
    const { rows } = await runner.query<SourceRow>(
      `SELECT ${SOURCE_COLUMNS} FROM identity_professional_source WHERE id = $1`,
      [sourceId],
    );
    return rows[0] ? toSource(rows[0]) : undefined;
  }

  /** Visibility of every source behind a set of provenance records. Drives node visibility. */
  async findSourceVisibilities(
    sourceIds: readonly string[],
    runner: Queryable = this.#db,
  ): Promise<Map<string, SourceVisibility>> {
    if (sourceIds.length === 0) return new Map();
    const { rows } = await runner.query<{ id: string; visibility: string }>(
      'SELECT id, visibility FROM identity_professional_source WHERE id = ANY($1)',
      [[...sourceIds]],
    );
    return new Map(rows.map((row) => [row.id, row.visibility as SourceVisibility]));
  }

  /** The preserved bytes. Separate from metadata reads so content is never loaded by accident. */
  async readSourceContent(sourceId: string, runner: Queryable = this.#db): Promise<Buffer | undefined> {
    const { rows } = await runner.query<{ content: Buffer }>(
      `SELECT COALESCE(extracted_text, content) AS content FROM identity_professional_source WHERE id = $1`,
      [sourceId],
    );
    return rows[0]?.content;
  }

  // --- Reconstruction jobs ----------------------------------------------------------------

  async insertJob(
    tx: Transaction,
    job: { id: string; personId: string; sourceId: string; trigger?: ReconstructionTrigger },
  ): Promise<ReconstructionJob> {
    const { rows } = await tx.query<JobRow>(
      `INSERT INTO identity_reconstruction_job (id, person_id, source_id, trigger)
       VALUES ($1, $2, $3, $4)
       RETURNING id, person_id, source_id, trigger, status, attempts, claimed_at, completed_at, last_error, created_at`,
      // Every job names the user action behind it. There is no scheduled trigger to pass.
      [job.id, job.personId, job.sourceId, job.trigger ?? 'source_added'],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to insert reconstruction job');
    return toJob(row);
  }

  /**
   * Claim pending (or abandoned) jobs.
   *
   * Same shape as `PostgresDurableQueue.claim` — `FOR UPDATE SKIP LOCKED` so concurrent workers
   * never take the same row, and a claim held past `reclaimAfterMs` is taken back because a worker
   * can die mid-extraction. Redelivery is therefore routine, which is why completion is idempotent.
   */
  async claimJobs(limit: number, reclaimAfterMs: number): Promise<readonly ReconstructionJob[]> {
    if (limit <= 0) return [];
    const { rows } = await this.#db.query<JobRow>(
      `UPDATE identity_reconstruction_job
          SET status = 'processing', claimed_at = now(), attempts = attempts + 1
        WHERE id IN (
              SELECT id FROM identity_reconstruction_job
               WHERE status = 'pending'
                  OR (status = 'processing' AND claimed_at < now() - ($2::int * interval '1 millisecond'))
               ORDER BY created_at
                  FOR UPDATE SKIP LOCKED
               LIMIT $1
        )
      RETURNING id, person_id, source_id, trigger, status, attempts, claimed_at, completed_at, last_error, created_at`,
      [limit, reclaimAfterMs],
    );
    return rows.map(toJob);
  }

  async findJob(jobId: string, runner: Queryable = this.#db): Promise<ReconstructionJob | undefined> {
    const { rows } = await runner.query<JobRow>(
      `SELECT id, person_id, source_id, trigger, status, attempts, claimed_at, completed_at, last_error, created_at
         FROM identity_reconstruction_job WHERE id = $1`,
      [jobId],
    );
    return rows[0] ? toJob(rows[0]) : undefined;
  }

  async findJobBySource(sourceId: string, runner: Queryable = this.#db): Promise<ReconstructionJob | undefined> {
    const { rows } = await runner.query<JobRow>(
      `SELECT id, person_id, source_id, trigger, status, attempts, claimed_at, completed_at, last_error, created_at
         FROM identity_reconstruction_job WHERE source_id = $1`,
      [sourceId],
    );
    return rows[0] ? toJob(rows[0]) : undefined;
  }

  async markJobSucceeded(tx: Transaction, jobId: string): Promise<void> {
    await tx.query(
      `UPDATE identity_reconstruction_job
          SET status = 'succeeded', completed_at = now(), last_error = NULL
        WHERE id = $1`,
      [jobId],
    );
  }

  /**
   * Record a failed extraction.
   *
   * The job carries the reason and stays retryable. **The source is untouched** — losing the
   * upload because a model call failed is the failure this preserves against.
   */
  async markJobFailed(jobId: string, error: string): Promise<void> {
    await this.#db.query(
      `UPDATE identity_reconstruction_job
          SET status = 'failed', completed_at = now(), claimed_at = NULL, last_error = $2
        WHERE id = $1`,
      [jobId, error.slice(0, 2000)],
    );
  }

  /** Put a failed job back in the queue. The source was never lost, so a retry is always possible. */
  async retryJob(jobId: string): Promise<boolean> {
    const { rowCount } = await this.#db.query(
      `UPDATE identity_reconstruction_job
          SET status = 'pending', claimed_at = NULL, completed_at = NULL
        WHERE id = $1 AND status = 'failed'`,
      [jobId],
    );
    return rowCount > 0;
  }

  // --- GitHub connection and repository selection -------------------------------------------

  async upsertGitHubConnection(
    tx: Transaction,
    connection: { id: string; personId: string; accountLogin: string },
  ): Promise<GitHubConnection> {
    // Reconnecting the same account is not a new connection. Reconnecting a *different* one
    // replaces it — the selections below are keyed on the person, so they survive deliberately:
    // permission the user granted is not revoked by an authentication hiccup.
    const { rows } = await tx.query<{
      id: string;
      person_id: string;
      account_login: string;
      connected_at: Date | string;
    }>(
      `INSERT INTO identity_github_connection (id, person_id, account_login)
       VALUES ($1, $2, $3)
       ON CONFLICT (person_id) DO UPDATE SET account_login = EXCLUDED.account_login
       RETURNING id, person_id, account_login, connected_at`,
      [connection.id, connection.personId, connection.accountLogin],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      personId: row.person_id,
      accountLogin: row.account_login,
      connectedAt: iso(row.connected_at),
    };
  }

  async findGitHubConnection(
    personId: string,
    runner: Queryable = this.#db,
  ): Promise<GitHubConnection | undefined> {
    const { rows } = await runner.query<{
      id: string;
      person_id: string;
      account_login: string;
      connected_at: Date | string;
    }>(
      'SELECT id, person_id, account_login, connected_at FROM identity_github_connection WHERE person_id = $1',
      [personId],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          personId: row.person_id,
          accountLogin: row.account_login,
          connectedAt: iso(row.connected_at),
        }
      : undefined;
  }

  /**
   * Record which repositories the user has allowed Joby to look at.
   *
   * Deselecting sets `selected = false` rather than deleting the row, so "the user considered this
   * and said no" is distinguishable from "the user has never seen it" — and a later re-selection
   * is a visible change of mind rather than a first-time grant.
   */
  async setRepositorySelections(
    tx: Transaction,
    personId: string,
    connectionId: string,
    selections: readonly { id: string; fullName: string; selected: boolean; isPrivate: boolean }[],
  ): Promise<void> {
    for (const selection of selections) {
      await tx.query(
        `INSERT INTO identity_repository_selection
           (id, person_id, connection_id, full_name, selected, is_private)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (person_id, full_name)
         DO UPDATE SET selected = EXCLUDED.selected,
                       is_private = EXCLUDED.is_private,
                       updated_at = now()`,
        [selection.id, personId, connectionId, selection.fullName, selection.selected, selection.isPrivate],
      );
    }
  }

  async listRepositorySelections(
    personId: string,
    options: { onlySelected?: boolean } = {},
    runner: Queryable = this.#db,
  ): Promise<readonly RepositorySelection[]> {
    const { rows } = await runner.query<{
      id: string;
      person_id: string;
      full_name: string;
      selected: boolean;
      is_private: boolean;
      selected_at: Date | string;
    }>(
      `SELECT id, person_id, full_name, selected, is_private, selected_at
         FROM identity_repository_selection
        WHERE person_id = $1 ${options.onlySelected ? 'AND selected' : ''}
        ORDER BY full_name`,
      [personId],
    );

    return rows.map((row) => ({
      id: row.id,
      personId: row.person_id,
      fullName: row.full_name,
      selected: row.selected,
      isPrivate: row.is_private,
      selectedAt: iso(row.selected_at),
    }));
  }

  /** The permission check. Ingestion asks this before touching GitHub, never after. */
  async isRepositorySelected(personId: string, fullName: string): Promise<boolean> {
    const { rows } = await this.#db.query<{ selected: boolean }>(
      'SELECT selected FROM identity_repository_selection WHERE person_id = $1 AND full_name = $2',
      [personId, fullName],
    );
    return rows[0]?.selected === true;
  }

  // --- Proposals --------------------------------------------------------------------------

  async insertProposal(
    tx: Transaction,
    proposal: {
      id: string;
      personId: string;
      sourceId: string;
      jobId: string;
      extractor: string;
      model: string;
      content: ReconstructionProposalContent;
    },
  ): Promise<ReconstructionProposal | undefined> {
    // `DO NOTHING` is the idempotency: a redelivered job must not produce a second proposal.
    // Returning undefined tells the caller this job's work was already done.
    const { rows } = await tx.query<ProposalRow>(
      `INSERT INTO identity_reconstruction_proposal
         (id, person_id, source_id, job_id, extractor, model, proposal)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (job_id) DO NOTHING
       RETURNING id, person_id, source_id, job_id, status, extractor, model, proposal, generated_at`,
      [
        proposal.id,
        proposal.personId,
        proposal.sourceId,
        proposal.jobId,
        proposal.extractor,
        proposal.model,
        JSON.stringify(proposal.content),
      ],
    );
    return rows[0] ? toProposal(rows[0]) : undefined;
  }

  async findProposal(proposalId: string, runner: Queryable = this.#db): Promise<ReconstructionProposal | undefined> {
    const { rows } = await runner.query<ProposalRow>(
      `SELECT id, person_id, source_id, job_id, status, extractor, model, proposal, generated_at
         FROM identity_reconstruction_proposal WHERE id = $1`,
      [proposalId],
    );
    return rows[0] ? toProposal(rows[0]) : undefined;
  }

  async findProposalByJob(jobId: string, runner: Queryable = this.#db): Promise<ReconstructionProposal | undefined> {
    const { rows } = await runner.query<ProposalRow>(
      `SELECT id, person_id, source_id, job_id, status, extractor, model, proposal, generated_at
         FROM identity_reconstruction_proposal WHERE job_id = $1`,
      [jobId],
    );
    return rows[0] ? toProposal(rows[0]) : undefined;
  }

  async listProposals(personId: string): Promise<readonly ReconstructionProposal[]> {
    const { rows } = await this.#db.query<ProposalRow>(
      `SELECT id, person_id, source_id, job_id, status, extractor, model, proposal, generated_at
         FROM identity_reconstruction_proposal WHERE person_id = $1 ORDER BY generated_at DESC`,
      [personId],
    );
    return rows.map(toProposal);
  }
}
