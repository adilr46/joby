/**
 * `packages/database` — the shared persistence layer.
 *
 * One PostgreSQL database (ADR 0003). This package owns the connection, transactions,
 * migrations, and the ADR 0004 delivery infrastructure. It owns **no domain data**: each
 * domain owns its own tables and its own repositories, in its own package.
 */

export {
  asTransaction,
  createDatabase,
  databaseConfigFromEnv,
  type Database,
  type DatabaseConfig,
  type Queryable,
  type QueryResult,
  type Transaction,
} from './client';

export { migrate, type MigrationResult } from './migrator';

export { PostgresOutboxStore } from './outbox-store';
export { PostgresDurableQueue, type PostgresDurableQueueOptions } from './durable-queue';
export { claimEventForHandler, oncePerEvent } from './idempotency';
