import type { JobyEvent } from './event';
import type { ModuleName } from './domains';
import type { EventName } from './names';

/**
 * How a handler is run. This is a property of the *handler*, never of the event —
 * an event means the same thing whichever path delivers it (ADR 0004).
 *
 * - `inline`     — runs in the publishing process, immediately after commit, via
 *                  `InProcessEventDispatcher`. No durability, no retries. Keep these
 *                  fast, cheap and local.
 * - `deferrable` — runs in `apps/worker`, from a durable queue fed by the transactional
 *                  outbox. Survives process failure. Anything doing AI work, network
 *                  calls, or heavy processing is deferrable.
 *
 * A handler is registered in exactly one runtime: inline handlers in `apps/api`,
 * deferrable handlers in `apps/worker`. Registering the same handler in both would run
 * it twice; `InProcessEventDispatcher`'s `accepts` option guards against that.
 */
export type HandlerDelivery = 'inline' | 'deferrable';

/**
 * A subscriber to one event type.
 *
 * A handler may only write to its own module's data. Reacting to another module's event is
 * how work crosses a boundary; writing into another module's tables is not (ADRs 0003, 0023).
 *
 * Handlers return nothing. Publishers do not observe handler outcomes, and a handler must
 * never be used to compute something the publisher needs.
 */
export interface EventHandler<TName extends EventName = EventName> {
  /** Stable, unique, and readable in logs, e.g. 'memory.record-outcome'. */
  readonly id: string;
  /** The module this handler belongs to — the only module it may write to. */
  readonly module: ModuleName;
  readonly handles: TName;
  readonly delivery: HandlerDelivery;
  handle(event: JobyEvent<TName>): Promise<void> | void;
}

/** Called when a handler throws. Failures are isolated: they never reach the publisher. */
export type HandlerErrorReporter = (error: unknown, context: {
  readonly handlerId: string;
  readonly event: JobyEvent;
}) => void;
