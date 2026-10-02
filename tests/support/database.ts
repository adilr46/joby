/**
 * Integration-test support.
 *
 * Integration tests need a real PostgreSQL. Without `DATABASE_URL` they are **skipped with a
 * visible reason**, never silently passed — a green run that tested nothing is worse than a
 * red one.
 *
 *   pnpm db:up
 *   $env:DATABASE_URL = 'postgres://joby:joby@localhost:5433/joby'
 *   pnpm test
 */

import { createDatabase, migrate, type Database } from '@joby/database';

export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDatabase = Boolean(DATABASE_URL);

export async function connectTestDatabase(): Promise<Database> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const db = createDatabase({ connectionString: DATABASE_URL });
  await migrate(db);
  return db;
}

/** Between tests, not between runs: leftover rows from a previous test are a false result. */
export async function truncateAll(db: Database): Promise<void> {
  await db.query('TRUNCATE event_outbox, processed_events');
}

/** Wipe Identity's tables. Ordered by dependency; `CASCADE` would hide a missed foreign key. */
export async function truncateIdentity(db: Database): Promise<void> {
  await db.query(
    `TRUNCATE adaptation_representation_draft, adaptation_application_input, adaptation_context,
              identity_representation_reference,
              identity_user_condition, identity_stated_context,
              identity_review_decision, identity_review, identity_correction, identity_provenance,
              identity_representation_decision, identity_representation_theme,
              identity_relation, identity_explicit_node, identity_representation,
              identity_reconstruction_proposal, identity_reconstruction_job,
              identity_repository_selection, identity_github_connection,
              identity_professional_source, identity_durable_identity, identity_person`,
  );
}

/**
 * A scratch table for delivery tests, created by the tests that use them.
 *
 * The ADR 0004 guarantees need *some* row to commit alongside an outbox row. Borrowing a
 * production table for that (as plan 001 did) leaves scaffolding in the schema; owning one here
 * keeps the guarantee tested and the schema clean.
 */
export async function createDeliveryProbeTable(db: Database): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS test_delivery_probe (
       id   text PRIMARY KEY,
       note text NOT NULL
     )`,
  );
}

/** Wipe Opportunity's and Intelligence's tables. Ordered by dependency, no `CASCADE`. */
export async function truncateOpportunity(db: Database): Promise<void> {
  await db.query(
    `TRUNCATE intelligence_opportunity_understanding, opportunity_evidence, opportunity`,
  );
}

/** Wipe Application's tables. Ordered by dependency, no `CASCADE`. */
export async function truncateApplication(db: Database): Promise<void> {
  await db.query(
    `TRUNCATE event_outbox, processed_events,
              application_outcome, application_interview_stage, application_communication,
              application_timeline_entry, application_submitted_material, application_lineage,
              application`,
  );
}

/** Wipe Execution's Application Session table. */
export async function truncateExecutionSession(db: Database): Promise<void> {
  await db.query(`TRUNCATE execution_session`);
}
