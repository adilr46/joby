import { newEventId, nowIso, type EventEnvelope, type EventMetadata } from './envelope';
import { EVENT_OWNER, type EventName } from './names';
import type { EventPayloads } from './payloads';

/** A Joby event: an envelope whose payload type is determined by its name. */
export type JobyEvent<TName extends EventName = EventName> = TName extends EventName
  ? EventEnvelope<TName, EventPayloads[TName]>
  : never;

/** Any event, for code that handles them uniformly (logging, an outbox, tests). */
export type AnyJobyEvent = JobyEvent;

/**
 * Build an event. `id` and `occurredAt` are generated here so every publisher produces
 * a consistent envelope; `owner` is derived from the name rather than passed in.
 *
 * Call this only when the fact is already durably true — events are published after commit.
 */
export function createEvent<TName extends EventName>(
  name: TName,
  input: {
    personId: string;
    payload: EventPayloads[TName];
    metadata: Omit<EventMetadata, 'owner'>;
    /** Override only when replaying or backfilling a fact that became true earlier. */
    occurredAt?: string;
  },
): JobyEvent<TName> {
  return {
    id: newEventId(),
    name,
    occurredAt: input.occurredAt ?? nowIso(),
    personId: input.personId,
    payload: input.payload,
    metadata: { ...input.metadata, owner: EVENT_OWNER[name] },
  } as JobyEvent<TName>;
}
