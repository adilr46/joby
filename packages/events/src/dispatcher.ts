import type { AnyJobyEvent, JobyEvent } from './event';
import type { EventHandler, HandlerDelivery, HandlerErrorReporter } from './handler';
import type { EventName } from './names';

export interface EventDispatcher {
  /**
   * Publish a fact that is already durably true.
   *
   * Call this *after* the transaction commits. Resolves once every handler has settled;
   * a failing handler does not reject this promise and does not stop the others.
   */
  publish(event: AnyJobyEvent): Promise<void>;
}

export interface DispatchFailure {
  readonly handlerId: string;
  readonly error: unknown;
}

export interface DispatchResult {
  readonly handled: readonly string[];
  readonly failed: readonly DispatchFailure[];
}

/**
 * A dispatcher that also reports what happened.
 *
 * Domain code must not use this — publishers ignore handler outcomes (ADR 0002). It exists
 * for the worker, which has to know whether a claimed queue message can be acknowledged
 * (ADR 0004).
 */
export interface ReportingEventDispatcher extends EventDispatcher {
  dispatch(event: AnyJobyEvent): Promise<DispatchResult>;
}

export interface EventSubscriber {
  /** Register a handler. Returns a function that removes it again (useful in tests). */
  subscribe<TName extends EventName>(handler: EventHandler<TName>): () => void;
}

/**
 * A map from event name to handlers, run in memory (ADR 0002).
 *
 * No persistence, no retries, no ordering guarantees between handlers — this class only runs
 * handlers. It is used in two places:
 *
 *  - in `apps/api`, constructed with `accepts: 'inline'`, to run inline handlers after commit;
 *  - in `apps/worker`, constructed with `accepts: 'deferrable'`, to run the handlers for a
 *    message already claimed from the durable queue (ADR 0004).
 *
 * Durability lives in the outbox and the queue, not here. That separation is why the same
 * class serves both runtimes.
 */
export class InProcessEventDispatcher implements ReportingEventDispatcher, EventSubscriber {
  readonly #handlers = new Map<EventName, EventHandler<EventName>[]>();
  readonly #onError: HandlerErrorReporter;
  /** When set, only handlers with this delivery may be registered. */
  readonly #accepts: HandlerDelivery | undefined;

  constructor(options: { onError?: HandlerErrorReporter; accepts?: HandlerDelivery } = {}) {
    this.#accepts = options.accepts;
    this.#onError =
      options.onError ??
      ((error, context) => {
        console.error(
          `[events] handler ${context.handlerId} failed on ${context.event.name} (${context.event.id})`,
          error,
        );
      });
  }

  subscribe<TName extends EventName>(handler: EventHandler<TName>): () => void {
    // A deferrable handler registered in the API would run inline *and* in the worker.
    if (this.#accepts !== undefined && handler.delivery !== this.#accepts) {
      throw new Error(
        `Handler ${handler.id} is '${handler.delivery}' but this dispatcher only accepts '${this.#accepts}' handlers`,
      );
    }

    const existing = this.#handlers.get(handler.handles) ?? [];
    if (existing.some((h) => h.id === handler.id)) {
      throw new Error(`Duplicate event handler id: ${handler.id}`);
    }

    const registered = handler as unknown as EventHandler<EventName>;
    this.#handlers.set(handler.handles, [...existing, registered]);

    return () => {
      const current = this.#handlers.get(handler.handles) ?? [];
      this.#handlers.set(
        handler.handles,
        current.filter((h) => h !== registered),
      );
    };
  }

  /** Fire and forget. Never rejects, never reports outcomes — the publisher's contract. */
  async publish(event: AnyJobyEvent): Promise<void> {
    await this.dispatch(event);
  }

  /**
   * Identical execution and identical failure isolation, but the caller learns what
   * happened. Only the worker should use this, to decide ack versus release.
   */
  async dispatch(event: AnyJobyEvent): Promise<DispatchResult> {
    const handlers = this.#handlers.get(event.name) ?? [];
    const handled: string[] = [];
    const failed: DispatchFailure[] = [];

    // Handlers are independent: one failing must not hide the others' work, and none of
    // them can fail the publisher.
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler.handle(event as JobyEvent<EventName>);
          handled.push(handler.id);
        } catch (error) {
          this.#onError(error, { handlerId: handler.id, event });
          failed.push({ handlerId: handler.id, error });
        }
      }),
    );

    return { handled, failed };
  }

  /** Introspection for tests and startup logging. */
  handlerIdsFor(name: EventName): readonly string[] {
    return (this.#handlers.get(name) ?? []).map((h) => h.id);
  }
}
