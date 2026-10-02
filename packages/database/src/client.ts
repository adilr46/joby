/**
 * The database client and transaction propagation (ADR 0003 — one database, ownership by
 * convention).
 *
 * Transactions are propagated **explicitly**: a repository that must participate in a caller's
 * transaction takes a `Queryable` parameter. There is deliberately no ambient/async-local
 * current-transaction magic. ADR 0004's guarantee — the outbox row commits with the domain
 * write — depends on being able to see, at the call site, which transaction a write is in.
 * Ambient context hides exactly that.
 */

import pg from 'pg';
import type { TransactionContext } from '@joby/events';

const { Pool } = pg;

export interface QueryResult<Row> {
  readonly rows: Row[];
  readonly rowCount: number;
}

/** Anything a statement can run against: the pool, or an open transaction. */
export interface Queryable {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

/**
 * An open transaction. Satisfies `TransactionContext`, so it is the handle passed to
 * `TransactionalEventPublisher.recordDurable`.
 */
export interface Transaction extends Queryable, TransactionContext {
  readonly isTransaction: true;
}

export interface Database extends Queryable {
  /**
   * Run `fn` inside one transaction. Commits if it resolves, rolls back if it throws.
   *
   * Nothing slow belongs in here: no HTTP, no model calls. A transaction held open across a
   * network call is how a connection pool dies.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Start the local database with `pnpm db:up` and export ' +
        'DATABASE_URL=postgres://joby:joby@localhost:5433/joby',
    );
  }
  return { connectionString, maxConnections: env.DATABASE_MAX_CONNECTIONS ? Number(env.DATABASE_MAX_CONNECTIONS) : undefined };
}

export function createDatabase(config: DatabaseConfig): Database {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 10,
  });

  return {
    async query(sql, params) {
      const result = await pool.query(sql, params ? [...params] : undefined);
      return { rows: result.rows as never[], rowCount: result.rowCount ?? 0 };
    },

    async transaction(fn) {
      const client = await pool.connect();
      const tx: Transaction = {
        isTransaction: true,
        async query(sql, params) {
          const result = await client.query(sql, params ? [...params] : undefined);
          return { rows: result.rows as never[], rowCount: result.rowCount ?? 0 };
        },
      };

      try {
        await client.query('BEGIN');
        const value = await fn(tx);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        // Rollback failure must not mask the original error — that is the one worth seeing.
        try {
          await client.query('ROLLBACK');
        } catch {
          /* connection is already broken; the pool will discard it */
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}

/**
 * Narrow an opaque `TransactionContext` back to something queryable.
 *
 * `packages/events` cannot depend on `packages/database`, so the transaction crosses that
 * boundary as an opaque handle. This is the one place it is re-opened, and it fails loudly
 * rather than silently writing outside the caller's transaction.
 */
export function asTransaction(tx: TransactionContext): Transaction {
  const candidate = tx as Partial<Transaction>;
  if (candidate.isTransaction !== true || typeof candidate.query !== 'function') {
    throw new TypeError(
      'Expected an open Joby transaction. Passing anything else discards the outbox ' +
        'durability guarantee (ADR 0004) instead of failing.',
    );
  }
  return candidate as Transaction;
}
