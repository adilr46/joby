/**
 * The durable queue abstraction (ADR 0004).
 *
 * Transport infrastructure — deliberately *not* part of the domain event definition. An
 * event means the same thing whether it arrives inline or through this queue, and nothing
 * in `names.ts`, `payloads.ts` or `event.ts` refers to this file.
 *
 * The intended implementation is PostgreSQL, in the single database (ADR 0003), claiming
 * rows with `SELECT ... FOR UPDATE SKIP LOCKED` so several workers can consume safely.
 * That implementation lives in `packages/database` and does not exist yet.
 *
 * Not Kafka, RabbitMQ or NATS. If the queue substrate is ever replaced, only this interface's
 * implementation changes.
 */

import type { AnyJobyEvent } from './event';

export interface QueueMessage {
  /** The envelope's id, which is also the outbox row key and the idempotency key. */
  readonly eventId: string;
  readonly event: AnyJobyEvent;
  /** How many times delivery has been attempted, including this one. */
  readonly attempts: number;
}

export interface ClaimOptions {
  /** Maximum messages to take in one claim. */
  readonly limit: number;
}

export interface DurableQueue {
  /**
   * Take up to `limit` pending messages and mark them in flight, so a concurrent worker
   * does not take the same ones. A claimed message that is never acked or released must
   * become claimable again — a worker can die mid-handler.
   */
  claim(options: ClaimOptions): Promise<readonly QueueMessage[]>;

  /** Delivery succeeded. The message is done and must not be delivered again. */
  ack(eventId: string): Promise<void>;

  /**
   * Delivery failed. The message returns to pending and the reason is recorded.
   *
   * There is no backoff schedule and no dead-letter queue yet, deliberately. Add them when
   * a real failure pattern exists, and record the decision in an ADR.
   */
  release(eventId: string, reason: { readonly message: string }): Promise<void>;
}
