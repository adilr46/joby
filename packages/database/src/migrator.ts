/**
 * Forward-only migrations.
 *
 * Each file runs once, in filename order, inside its own transaction, and is recorded in
 * `schema_migrations` with a checksum. There is no `down`: rolling a schema backwards in a
 * system that has already written data is a rewrite, not a rollback. Fix forward.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Database } from './client';

export interface AppliedMigration {
  readonly version: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

async function ensureRegistry(db: Database): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text        PRIMARY KEY,
      checksum   text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migrate(db: Database, directory: string = MIGRATIONS_DIR): Promise<MigrationResult> {
  await ensureRegistry(db);

  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

  const { rows } = await db.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations',
  );
  const already = new Map(rows.map((row) => [row.version, row.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = await readFile(directory + file, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const previous = already.get(version);
    if (previous !== undefined) {
      // An edited migration means one database has a schema nobody else does. Loud, always.
      if (previous !== checksum) {
        throw new Error(
          `Migration ${version} has changed since it was applied. Migrations are immutable ` +
            'once applied — add a new one instead.',
        );
      }
      skipped.push(version);
      continue;
    }

    // Per-migration transaction: a failure leaves the earlier ones applied and this one absent,
    // which is a state the next run can continue from.
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        checksum,
      ]);
    });

    applied.push(version);
  }

  return { applied, skipped };
}
