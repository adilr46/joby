/**
 * Handler idempotency, keyed on `event.id` (ADR 0004).
 *
 * Delivery is at-least-once: a worker can die after a handler succeeded but before the ack,
 * and a reclaimed in-flight message is redelivered. Every deferrable handler therefore has to
 * survive being run twice with an identical final state.
 *
 * The mechanism is insert-first, not look-then-write. Two workers running the same handler
 * concurrently both pass a `SELECT` check; only one can win the primary key.
 */

import type { Transaction } from './client';

/**
 * Claim the right to perform `handlerId`'s work for `eventId`, inside the caller's
 * transaction. Returns false if it was already done.
 *
 * Must be called in the *same* transaction as the work it guards. In a separate one, the
 * claim can commit while the work rolls back, and the event is then permanently skipped.
 */
export async function claimEventForHandler(
  tx: Transaction,
  eventId: string,
  handlerId: string,
): Promise<boolean> {
  const { rowCount } = await tx.query(
    `INSERT INTO processed_events (event_id, handler_id)
     VALUES ($1, $2)
     ON CONFLICT (event_id, handler_id) DO NOTHING`,
    [eventId, handlerId],
  );
  return rowCount > 0;
}

/**
 * Run `work` exactly once for this (event, handler) pair.
 *
 * `work` receives the transaction holding the claim, so its writes and the claim commit
 * together. Returns whether the work ran.
 */
export async function oncePerEvent(
  tx: Transaction,
  eventId: string,
  handlerId: string,
  work: (tx: Transaction) => Promise<void>,
): Promise<boolean> {
  if (!(await claimEventForHandler(tx, eventId, handlerId))) {
    return false;
  }
  await work(tx);
  return true;
}
