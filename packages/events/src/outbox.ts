/**
 * The transactional outbox (ADR 0004).
 *
 * The guarantee: a committed domain change must not lose a required deferrable event
 * because the process died between the database write and asynchronous publication. The
 * outbox row is written in the *same* transaction as the domain data, so either both are
 * durable or neither is.
 *
 * This file is a contract only. The Postgres-backed implementation lives in
 * `packages/database` and does not exist yet.
 */

import type { AnyJobyEvent } from './event';
import type { EventName } from './names';

declare const transactionBrand: unique symbol;

/**
 * An opaque handle to an open database transaction.
 *
 * `packages/events` must not depend on `packages/database`, so the concrete transaction type
 * is supplied by the caller. The optional brand documents intent without constraining shape.
 */
export interface TransactionContext {
  readonly [transactionBrand]?: never;
}

/**
 * Where an event is in its journey to a worker.
 *
 * `failed` records that delivery did not succeed. Nothing acts on it automatically yet —
 * there is deliberately no retry schedule and no dead-letter handling (ADR 0004).
 */
export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface OutboxRecord {
  /** The envelope's own id. Also the idempotency key a handler should use. */
  readonly eventId: string;
  readonly eventName: EventName;
  /** The complete envelope, unmodified. Delivery must never alter an event. */
  readonly envelope: AnyJobyEvent;
  /** When the row was written, i.e. when the domain transaction ran. Not `occurredAt`. */
  readonly createdAt: string;
  readonly status: OutboxStatus;
  readonly claimedAt?: string;
  readonly processedAt?: string;
  /** Observability only. No scheduling policy reads this yet. */
  readonly attempts: number;
  readonly lastError?: string;
}

export interface OutboxStore {
  /**
   * Write an event to the outbox.
   *
   * MUST be called inside the same transaction as the domain write it accompanies. Calling
   * it outside one silently discards the durability guarantee, which is the entire point.
   */
  write(tx: TransactionContext, record: OutboxRecord): Promise<void>;
}

/** Build the row for an event. Pure: the envelope goes in whole and untouched. */
export function toOutboxRecord(event: AnyJobyEvent, now: string = new Date().toISOString()): OutboxRecord {
  return {
    eventId: event.id,
    eventName: event.name,
    envelope: event,
    createdAt: now,
    status: 'pending',
    attempts: 0,
  };
}
