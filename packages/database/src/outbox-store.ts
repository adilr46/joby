/**
 * Postgres `OutboxStore` (ADR 0004).
 *
 * The whole value of this class is the transaction it is *given*. It never opens one: an
 * outbox row written on its own connection commits independently of the domain data, which
 * looks identical in tests and silently loses the guarantee in production.
 */

import type { OutboxRecord, OutboxStore, TransactionContext } from '@joby/events';
import { serializeEvent } from '@joby/events';

import { asTransaction } from './client';

export class PostgresOutboxStore implements OutboxStore {
  async write(tx: TransactionContext, record: OutboxRecord): Promise<void> {
    const transaction = asTransaction(tx);

    // A repeated event id is a bug in the publisher, not a delivery retry — ids are minted
    // per event. Let the primary key surface it rather than swallowing it with DO NOTHING.
    await transaction.query(
      `INSERT INTO event_outbox (event_id, event_name, envelope, created_at, status, attempts)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        record.eventId,
        record.eventName,
        serializeEvent(record.envelope),
        record.createdAt,
        record.status,
        record.attempts,
      ],
    );
  }
}
