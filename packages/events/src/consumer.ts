/**
 * The consuming side: queue → handler (ADR 0004).
 *
 * This is the contract `apps/worker` composes. It knows about the queue and about running
 * handlers, and nothing about any domain.
 */

import type { ReportingEventDispatcher } from './dispatcher';
import type { DurableQueue, QueueMessage } from './queue';

export interface ConsumeResult {
  readonly claimed: number;
  readonly acked: number;
  readonly released: number;
}

export interface EventConsumer {
  /** Claim one batch, run its handlers, settle each message. Returns what happened. */
  runOnce(options?: { limit?: number }): Promise<ConsumeResult>;
}

/**
 * Claims messages and runs the deferrable handlers registered for them.
 *
 * The dispatcher passed in is an `InProcessEventDispatcher` constructed with
 * `accepts: 'deferrable'` — the same class the API uses for inline handlers, with a
 * different set of handlers registered. Durability is the queue's job, not the dispatcher's.
 *
 * A message is acked only when every handler succeeded. If any failed it is released, so it
 * will be delivered again — meaning **handlers must be idempotent**. Use `event.id` as the
 * idempotency key.
 */
export class QueueEventConsumer implements EventConsumer {
  readonly #queue: DurableQueue;
  readonly #handlers: ReportingEventDispatcher;
  readonly #defaultLimit: number;

  constructor(dependencies: {
    queue: DurableQueue;
    handlers: ReportingEventDispatcher;
    defaultLimit?: number;
  }) {
    this.#queue = dependencies.queue;
    this.#handlers = dependencies.handlers;
    this.#defaultLimit = dependencies.defaultLimit ?? 10;
  }

  async runOnce(options: { limit?: number } = {}): Promise<ConsumeResult> {
    const messages = await this.#queue.claim({ limit: options.limit ?? this.#defaultLimit });

    let acked = 0;
    let released = 0;

    // Messages settle independently; one poisonous message must not strand the batch.
    for (const message of messages) {
      if (await this.#settle(message)) {
        acked += 1;
      } else {
        released += 1;
      }
    }

    return { claimed: messages.length, acked, released };
  }

  async #settle(message: QueueMessage): Promise<boolean> {
    const result = await this.#handlers.dispatch(message.event);

    if (result.failed.length === 0) {
      await this.#queue.ack(message.eventId);
      return true;
    }

    const summary = result.failed
      .map((failure) => `${failure.handlerId}: ${String(failure.error)}`)
      .join('; ');

    await this.#queue.release(message.eventId, {
      message: `${result.failed.length} handler(s) failed — ${summary}`,
    });
    return false;
  }
}
