/**
 * Postgres `DurableQueue` (ADR 0004), over the `event_outbox` table.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so several workers can consume concurrently without
 * taking the same row. Not Kafka, not RabbitMQ — and nothing here should grow into a broker
 * (ADR 0004 defers that until an event genuinely needs to leave Joby).
 */

import type { ClaimOptions, DurableQueue, QueueMessage } from '@joby/events';
import { parseEvent } from '@joby/events';

import type { Database } from './client';

export interface PostgresDurableQueueOptions {
  /**
   * How long a claim may be held before another worker may take it.
   *
   * A worker that dies mid-handler leaves a row in `processing` forever otherwise. The
   * contract requires such a message to become claimable again — which is also why handlers
   * must be idempotent: reclaiming can redeliver work that in fact succeeded.
   */
  readonly reclaimAfterMs?: number;
}

interface ClaimedRow extends Record<string, unknown> {
  event_id: string;
  envelope: unknown;
  attempts: number;
}

export class PostgresDurableQueue implements DurableQueue {
  readonly #db: Database;
  readonly #reclaimAfterMs: number;

  constructor(db: Database, options: PostgresDurableQueueOptions = {}) {
    this.#db = db;
    this.#reclaimAfterMs = options.reclaimAfterMs ?? 60_000;
  }

  async claim(options: ClaimOptions): Promise<readonly QueueMessage[]> {
    if (options.limit <= 0) return [];

    // One statement: select-then-update in two round trips would let a concurrent worker
    // claim between them, and SKIP LOCKED only protects a single statement's snapshot.
    const { rows } = await this.#db.query<ClaimedRow>(
      `UPDATE event_outbox
          SET status = 'processing',
              claimed_at = now(),
              attempts = attempts + 1
        WHERE event_id IN (
              SELECT event_id
                FROM event_outbox
               WHERE status = 'pending'
                  OR (status = 'processing' AND claimed_at < now() - ($2::int * interval '1 millisecond'))
               ORDER BY created_at
                  FOR UPDATE SKIP LOCKED
               LIMIT $1
        )
      RETURNING event_id, envelope, attempts`,
      [options.limit, this.#reclaimAfterMs],
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      // The envelope came back out of a jsonb column: `unknown` until proven otherwise.
      event: parseEvent(row.envelope),
      attempts: row.attempts,
    }));
  }

  async ack(eventId: string): Promise<void> {
    await this.#db.query(
      `UPDATE event_outbox
          SET status = 'processed', processed_at = now(), last_error = NULL
        WHERE event_id = $1`,
      [eventId],
    );
  }

  async release(eventId: string, reason: { readonly message: string }): Promise<void> {
    // Back to pending, with the reason kept. No backoff and no dead-letter queue yet, on
    // purpose (ADR 0004) — add them when a real failure pattern exists to design against.
    await this.#db.query(
      `UPDATE event_outbox
          SET status = 'pending', claimed_at = NULL, last_error = $2
        WHERE event_id = $1`,
      [eventId, reason.message],
    );
  }
}
