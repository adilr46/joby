/**
 * The publishing side of the two delivery paths (ADR 0004).
 *
 * Publishing an event is two separate acts happening at two different moments, and the
 * difference matters enough to be named in the API rather than left to a comment:
 *
 *   BEGIN
 *     ... domain data write ...
 *     await events.recordDurable(tx, event)   // inside the transaction
 *   COMMIT
 *   await events.publishCommitted(event)      // after the transaction
 *
 * `recordDurable` is what makes the guarantee hold: the outbox row and the domain data
 * commit together, so a crash before `publishCommitted` loses nothing that was required to
 * be durable. `publishCommitted` runs inline handlers only, and cannot fail the caller.
 *
 * An event may go through both, one, or neither. That is a deployment fact about handlers,
 * not a property of the event.
 */

import type { EventDispatcher } from './dispatcher';
import type { AnyJobyEvent } from './event';
import { toOutboxRecord, type OutboxStore, type TransactionContext } from './outbox';

export class TransactionalEventPublisher {
  readonly #outbox: OutboxStore;
  readonly #inline: EventDispatcher;

  constructor(dependencies: { outbox: OutboxStore; inline: EventDispatcher }) {
    this.#outbox = dependencies.outbox;
    this.#inline = dependencies.inline;
  }

  /**
   * Call inside the domain transaction, for events with deferrable handlers.
   *
   * This one *may* throw, and it must: if the outbox write fails, the domain transaction
   * has to roll back with it. That is the opposite of `publishCommitted`, and it is why
   * they are separate methods.
   */
  async recordDurable(tx: TransactionContext, event: AnyJobyEvent): Promise<void> {
    await this.#outbox.write(tx, toOutboxRecord(event));
  }

  /** Call after commit. Runs inline handlers. Never throws, never reports outcomes. */
  async publishCommitted(event: AnyJobyEvent): Promise<void> {
    await this.#inline.publish(event);
  }
}
